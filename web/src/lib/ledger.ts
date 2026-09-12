// Browser-side ledger access for the Track 1 hackathon network.
//
// Reads go straight to the validated ledger over WebSocket. Nothing here trusts a submission
// result on its own: callers re-read state after a transaction validates, which is the only way to
// tell a settled sale from an outer tesSUCCESS over inner legs that never executed.
import {
  Client,
  Wallet,
  signLoanSetByCounterparty,
  type LoanSet,
  type SubmittableTransaction,
} from "xrpl";
import { TRACK1 } from "./network";
import { floorAccountingDrops, subtractAccountingDrops, valuePosition } from "./accounting";
import { assertActiveSigner } from "./signing-session";
import { browserJournal, notifySubmissions, type PendingSubmission } from "./submission-journal";

let client: Client | null = null;
let connecting: Promise<Client> | null = null;
let connectionGeneration = 0;

export async function getClient(): Promise<Client> {
  if (client?.isConnected()) return client;
  if (connecting) return connecting;
  const previous = client;
  client = null;
  const generation = connectionGeneration;
  const pending = (async () => {
    // disconnect() also cancels SDK reconnect timers when the socket is already closed.
    if (previous) await previous.disconnect();
    if (generation !== connectionGeneration) throw new Error("Connection cancelled.");
    const next = new Client(TRACK1.wsUrl, { connectionTimeout: 15_000, timeout: 20_000 });
    client = next;
    // xrpl.js emits transport errors as well as rejecting requests.
    next.on("error", () => { /* Request failures are surfaced to the requesting screen. */ });
    try {
      await next.connect();
      if (generation !== connectionGeneration) throw new Error("Connection cancelled.");
      return next;
    } catch (error) {
      await next.disconnect().catch(() => {});
      if (client === next) client = null;
      throw error;
    }
  })();
  connecting = pending;
  try { return await pending; }
  finally { if (connecting === pending) connecting = null; }
}

export async function disconnect() {
  connectionGeneration++;
  const previous = client;
  client = null;
  connecting = null;
  if (previous) await previous.disconnect();
}

export function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Missing or invalid ${label}.`);
  return value as Record<string, unknown>;
}

// ---------------------------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------------------------

export interface NetworkStatus {
  networkId: number;
  matches: boolean;
  build: string;
  ledgerIndex: number;
  ledgerAgeSeconds: number;
  checkedAt: string;
}

export async function readNetworkStatus(): Promise<NetworkStatus> {
  const c = await getClient();
  const info = record((await c.request({ command: "server_info" })).result.info, "server_info");
  const ledger = record(info.validated_ledger, "validated ledger");
  const networkId = Number(info.network_id);
  return {
    networkId,
    matches: networkId === TRACK1.networkId,
    build: String(info.build_version),
    ledgerIndex: Number(ledger.seq),
    ledgerAgeSeconds: Number(ledger.age),
    checkedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------------------------
// Accounts and balances
// ---------------------------------------------------------------------------------------------

export async function readXrpBalance(address: string): Promise<string> {
  const c = await getClient();
  try {
    const response = await c.request({ command: "account_info", account: address, ledger_index: "validated" });
    return response.result.account_data.Balance;
  } catch (error) {
    if (isActNotFound(error)) return "0";
    throw error;
  }
}

export function isActNotFound(error: unknown): boolean {
  const data = (error as { data?: { error?: string } })?.data;
  return data?.error === "actNotFound";
}

export function isEntryNotFound(error: unknown): boolean {
  const data = (error as { data?: { error?: string } })?.data;
  return data?.error === "entryNotFound";
}

// Loan amounts arrive as fractional drop strings (PeriodicPayment, TotalValueOutstanding), unlike
// every other amount on the ledger. Screens work in whole drops, so they are floored here once.
export function wholeDrops(value: unknown): string {
  return floorAccountingDrops(String(value ?? "0"));
}

export async function accountExists(address: string): Promise<boolean> {
  const c = await getClient();
  try {
    await c.request({ command: "account_info", account: address, ledger_index: "validated" });
    return true;
  } catch (error) {
    if (isActNotFound(error)) return false;
    throw error;
  }
}

// ---------------------------------------------------------------------------------------------
// Vaults and shares (XLS-65)
// ---------------------------------------------------------------------------------------------

export interface VaultState {
  vaultId: string;
  owner: string;
  pseudoAccount: string;
  shareMptId: string;
  assetsTotalDrops: string;
  assetsAvailableDrops: string;
  lossUnrealizedDrops?: string;
  sharesOutstanding: string;
  transferable: boolean;
  ledgerIndex: number;
}

export async function readVault(vaultId: string): Promise<VaultState> {
  const c = await getClient();
  const response = await c.request({ command: "ledger_entry", index: vaultId, ledger_index: "validated" });
  const vault = record(response.result.node, "vault");
  if (vault.LedgerEntryType !== "Vault") throw new Error("That ledger index is not a Vault.");
  const shareMptId = String(vault.ShareMPTID);
  const issuance = await readShareIssuance(shareMptId);
  return {
    vaultId,
    owner: String(vault.Owner),
    pseudoAccount: String(vault.Account),
    shareMptId,
    assetsTotalDrops: String(vault.AssetsTotal ?? "0"),
    assetsAvailableDrops: String(vault.AssetsAvailable ?? "0"),
    lossUnrealizedDrops: String(vault.LossUnrealized ?? "0"),
    sharesOutstanding: issuance.outstanding,
    transferable: issuance.transferable,
    ledgerIndex: Number((response.result as { ledger_index?: number }).ledger_index ?? 0),
  };
}

export async function readShareIssuance(shareMptId: string): Promise<{ outstanding: string; transferable: boolean; issuer: string }> {
  const c = await getClient();
  const response = await c.request({ command: "ledger_entry", mpt_issuance: shareMptId, ledger_index: "validated" });
  const issuance = record(response.result.node, "share issuance");
  const TF_CAN_TRANSFER = 0x00000020;
  return {
    outstanding: String(issuance.OutstandingAmount ?? "0"),
    transferable: (Number(issuance.Flags) & TF_CAN_TRANSFER) !== 0,
    issuer: String(issuance.Issuer),
  };
}

export interface ShareHolding {
  shareMptId: string;
  amount: string;
}

// Every MPT holding of an account. Vault shares are MPTs whose issuer is a vault pseudo-account.
export async function readShareHoldings(address: string): Promise<ShareHolding[]> {
  const c = await getClient();
  try {
    const response = await c.request({ command: "account_objects", account: address, type: "mptoken", ledger_index: "validated" });
    return (response.result.account_objects ?? []).map((value) => {
      const holding = record(value, "mptoken holding");
      return { shareMptId: String(holding.MPTokenIssuanceID), amount: String(holding.MPTAmount ?? "0") };
    });
  } catch (error) {
    if (isActNotFound(error)) return [];
    throw error;
  }
}

export async function readShareBalance(address: string, shareMptId: string): Promise<string> {
  const holdings = await readShareHoldings(address);
  return holdings.find((h) => h.shareMptId === shareMptId)?.amount ?? "0";
}

export async function hasShareHolder(address: string, shareMptId: string): Promise<boolean> {
  const holdings = await readShareHoldings(address);
  return holdings.some((h) => h.shareMptId === shareMptId);
}

// Accounting value of a share quantity, exact integer division in drops.
export function shareValueDrops(shares: string, vault: Pick<VaultState, "assetsTotalDrops" | "sharesOutstanding" | "lossUnrealizedDrops">): string {
  return valuePosition({ assetsTotalDrops: vault.assetsTotalDrops, assetsAvailableDrops: "0", lossUnrealizedDrops: vault.lossUnrealizedDrops ?? "0", totalSharesRaw: vault.sharesOutstanding, heldSharesRaw: shares, shareScale: 0 }).accountingClaimDrops;
}

// Market listings can outlive their share supply. Display an unavailable estimate instead of
// letting an invalid or changed snapshot crash the page; execution still requires server checks.
export function estimateShareValueDrops(shares: string, vault: Pick<VaultState, "assetsTotalDrops" | "sharesOutstanding" | "lossUnrealizedDrops">): string | null {
  try { return shareValueDrops(shares, vault); } catch { return null; }
}

// Vaults an account owns, from its owner directory.
export async function readOwnedVaults(address: string): Promise<VaultState[]> {
  const c = await getClient();
  try {
    const response = await c.request({ command: "account_objects", account: address, type: "vault" as never, ledger_index: "validated" });
    const vaults: VaultState[] = [];
    for (const value of response.result.account_objects ?? []) {
      const vault = record(value, "vault");
      vaults.push(await readVault(String(vault.index)));
    }
    return vaults;
  } catch (error) {
    if (isActNotFound(error)) return [];
    throw error;
  }
}

// ---------------------------------------------------------------------------------------------
// Lending (XLS-66)
// ---------------------------------------------------------------------------------------------

export interface BrokerState {
  loanBrokerId: string;
  owner: string;
  // The broker's pseudo-account. Loan objects live in ITS owner directory (and the borrower's),
  // not in the operator's, so this is how a broker's loans are found.
  pseudoAccount: string;
  vaultId: string;
  coverAvailableDrops: string;
  debtTotalDrops: string;
  debtMaximumDrops: string;
  coverRateMinimum: number; // 1/10 bps
  coverRateLiquidation: number;
  managementFeeRate: number;
}

export async function readBroker(loanBrokerId: string): Promise<BrokerState> {
  const c = await getClient();
  const response = await c.request({ command: "ledger_entry", index: loanBrokerId, ledger_index: "validated" });
  const broker = record(response.result.node, "loan broker");
  if (broker.LedgerEntryType !== "LoanBroker") throw new Error("That ledger index is not a LoanBroker.");
  return {
    loanBrokerId,
    owner: String(broker.Owner),
    pseudoAccount: String(broker.Account),
    vaultId: String(broker.VaultID),
    coverAvailableDrops: String(broker.CoverAvailable ?? "0"),
    debtTotalDrops: String(broker.DebtTotal ?? "0"),
    debtMaximumDrops: String(broker.DebtMaximum ?? "0"),
    coverRateMinimum: Number(broker.CoverRateMinimum ?? 0),
    coverRateLiquidation: Number(broker.CoverRateLiquidation ?? 0),
    managementFeeRate: Number(broker.ManagementFeeRate ?? 0),
  };
}

export async function readOwnedBrokers(address: string): Promise<BrokerState[]> {
  const c = await getClient();
  try {
    const response = await c.request({ command: "account_objects", account: address, type: "loan_broker" as never, ledger_index: "validated" });
    return (response.result.account_objects ?? []).map((value) => {
      const b = record(value, "loan broker");
      return {
        loanBrokerId: String(b.index),
        owner: String(b.Owner),
        pseudoAccount: String(b.Account),
        vaultId: String(b.VaultID),
        coverAvailableDrops: String(b.CoverAvailable ?? "0"),
        debtTotalDrops: String(b.DebtTotal ?? "0"),
        debtMaximumDrops: String(b.DebtMaximum ?? "0"),
        coverRateMinimum: Number(b.CoverRateMinimum ?? 0),
        coverRateLiquidation: Number(b.CoverRateLiquidation ?? 0),
        managementFeeRate: Number(b.ManagementFeeRate ?? 0),
      };
    });
  } catch (error) {
    if (isActNotFound(error)) return [];
    throw error;
  }
}

export interface LoanState {
  loanId: string;
  loanBrokerId: string;
  borrower: string;
  principalOutstandingDrops: string; // whole drops
  totalValueOutstandingDrops: string; // exact decimal/scientific drops for repayment arithmetic
  scheduledInterestRemainingDrops: string;
  periodicPaymentDrops: string; // exact drops; round up only when building a payment
  closePaymentFeeDrops: string; // "0" when the ledger omits the optional field
  paymentRemaining: number;
  paymentInterval: number;
  gracePeriod: number;
  interestRate: number; // 1/10 bps
  nextPaymentDueDate: number; // ripple epoch seconds
  startDate: number;
  flags: number;
}

const RIPPLE_EPOCH_OFFSET = 946_684_800;
export const rippleTimeToDate = (seconds: number) => new Date((seconds + RIPPLE_EPOCH_OFFSET) * 1000);

function toLoanState(loan: Record<string, unknown>, loanId: string): LoanState {
  const principal = wholeDrops(loan.PrincipalOutstanding);
  return {
    loanId,
    loanBrokerId: String(loan.LoanBrokerID),
    borrower: String(loan.Borrower),
    principalOutstandingDrops: principal,
    totalValueOutstandingDrops: String(loan.TotalValueOutstanding ?? "0"),
    scheduledInterestRemainingDrops: floorAccountingDrops(subtractAccountingDrops(String(loan.TotalValueOutstanding ?? "0"), String(loan.PrincipalOutstanding ?? "0"))),
    periodicPaymentDrops: String(loan.PeriodicPayment ?? "0"),
    closePaymentFeeDrops: wholeDrops(loan.ClosePaymentFee),
    paymentRemaining: Number(loan.PaymentRemaining ?? 0),
    paymentInterval: Number(loan.PaymentInterval ?? 0),
    gracePeriod: Number(loan.GracePeriod ?? 0),
    interestRate: Number(loan.InterestRate ?? 0),
    nextPaymentDueDate: Number(loan.NextPaymentDueDate ?? 0),
    startDate: Number(loan.StartDate ?? 0),
    flags: Number(loan.Flags ?? 0),
  };
}

export async function readLoan(loanId: string): Promise<LoanState> {
  const c = await getClient();
  const response = await c.request({ command: "ledger_entry", index: loanId, ledger_index: "validated" });
  const loan = record(response.result.node, "loan");
  if (loan.LedgerEntryType !== "Loan") throw new Error("That ledger index is not a Loan.");
  return toLoanState(loan, loanId);
}

// Every loan originated by these brokers, read from each broker pseudo-account's owner directory.
export async function readLoansForBrokers(brokers: Pick<BrokerState, "pseudoAccount">[]): Promise<LoanState[]> {
  const lists = await Promise.all(brokers.map((b) => readLoansFor(b.pseudoAccount)));
  const seen = new Set<string>();
  return lists.flat().filter((l) => (seen.has(l.loanId) ? false : (seen.add(l.loanId), true)));
}

// Loans in an account's owner directory: the borrower's, or a broker pseudo-account's. The operator's
// own account holds none, which is why the operator desk goes through readLoansForBrokers.
export async function readLoansFor(address: string): Promise<LoanState[]> {
  const c = await getClient();
  try {
    const response = await c.request({ command: "account_objects", account: address, type: "loan" as never, ledger_index: "validated" });
    return (response.result.account_objects ?? []).map((value) => {
      const loan = record(value, "loan");
      return toLoanState(loan, String(loan.index));
    });
  } catch (error) {
    if (isActNotFound(error)) return [];
    throw error;
  }
}

// ---------------------------------------------------------------------------------------------
// Submission
// ---------------------------------------------------------------------------------------------

export interface Submitted {
  hash: string;
  ledgerIndex: number;
  resultCode: string;
  validated: boolean;
  meta: Record<string, unknown>;
}

// Signs and waits for validation. Rejections (tec*, tem*) are returned, not thrown, so screens can
// explain them; only transport failures throw.
async function withSubmissionLock<T>(account: string, action: () => Promise<T>): Promise<T> {
  if (typeof navigator === "undefined" || !navigator.locks) throw new Error("This browser cannot protect concurrent submissions. Use a browser with Web Locks on localhost or HTTPS.");
  return navigator.locks.request("raise-submit-journal", async () => {
    browserJournal().assertClear(account);
    return action();
  });
}

async function submitTracked(c: Client, prepared: SubmittableTransaction, signed: { hash: string; tx_blob: string }): Promise<Submitted> {
  const journal = browserJournal();
  journal.record({ hash: signed.hash, account: prepared.Account, transactionType: prepared.TransactionType, networkId: 4001, lastLedgerSequence: Number(prepared.LastLedgerSequence), createdAt: new Date().toISOString() });
  notifySubmissions();
  try {
    const result = (await c.submitAndWait(signed.tx_blob)).result;
    const meta = record(result.meta, "transaction metadata");
    if (result.validated !== true || String(result.hash).toUpperCase() !== signed.hash.toUpperCase() || !Number.isSafeInteger(result.ledger_index) || Number(result.ledger_index) < 1 || typeof meta.TransactionResult !== "string") throw new Error("Transaction validation is not confirmed.");
    journal.resolveValidated(signed.hash);
    notifySubmissions();
    return { hash: signed.hash, ledgerIndex: Number(result.ledger_index), resultCode: String(meta.TransactionResult), validated: true, meta };
  } catch (cause) {
    throw new Error(`Transaction ${signed.hash} is saved for recovery. ${(cause as Error).message} Use Check transaction in the recovery notice; do not send it again.`);
  }
}

export async function recoverSubmission(entry: PendingSubmission): Promise<Submitted | null> {
  const net = await readNetworkStatus();
  if (!net.matches || !Number.isFinite(net.ledgerAgeSeconds) || net.ledgerAgeSeconds > 30) throw new Error("Cannot check a transaction on an unavailable or stale network.");
  const c = await getClient();
  try {
    const result = (await c.request({ command: "tx", transaction: entry.hash })).result;
    if (result.validated !== true) return null;
    const transaction = record(result.tx_json, "validated transaction");
    const meta = record(result.meta, "validated transaction metadata");
    if (String(result.hash).toUpperCase() !== entry.hash.toUpperCase() || transaction.Account !== entry.account || transaction.TransactionType !== entry.transactionType || transaction.NetworkID !== 4001) throw new Error("Recorded transaction identity does not match the ledger response.");
    if (!Number.isSafeInteger(result.ledger_index) || Number(result.ledger_index) < 1 || typeof meta.TransactionResult !== "string") throw new Error("Transaction validation metadata is incomplete.");
    if (!navigator.locks) throw new Error("Web Locks are required to update transaction recovery safely.");
    await navigator.locks.request("raise-submit-journal", () => browserJournal().resolveValidated(entry.hash));
    notifySubmissions();
    return { hash: entry.hash, ledgerIndex: Number(result.ledger_index), resultCode: String(meta.TransactionResult), validated: true, meta };
  } catch (cause) {
    if ((cause as { data?: { error?: string } }).data?.error === "txnNotFound") return null;
    throw cause;
  }
}

export async function signAndSubmit(transaction: SubmittableTransaction, wallet: Wallet): Promise<Submitted> {
  if (transaction.Account !== wallet.classicAddress) throw new Error("Connect the account that owns this operation.");
  return withSubmissionLock(wallet.classicAddress, async () => {
    const c = await getClient();
    const prepared = await c.autofill(transaction);
    if (prepared.NetworkID !== TRACK1.networkId) throw new Error(`Refusing to sign for network ${prepared.NetworkID}.`);
    // VaultCreate burns the incremental owner reserve (2 XRP on network 4001).
    // Its SDK autofill cost intentionally exceeds the ordinary transaction cap.
    const isVaultCreation = transaction.TransactionType === "VaultCreate" && prepared.TransactionType === "VaultCreate";
    const feeLimitDrops = isVaultCreation ? 2_000_000n : 1_000_000n;
    if (!/^[1-9]\d*$/.test(String(prepared.Fee)) || BigInt(prepared.Fee!) > feeLimitDrops) {
      throw new Error(`Transaction fee exceeds the ${isVaultCreation ? "2 XRP VaultCreate" : "1 XRP"} signing limit.`);
    }
    assertActiveSigner(wallet);
    return submitTracked(c, prepared, wallet.sign(prepared));
  });
}

// Operator-only demo: broker signs first, borrower counter-signs. Public hash recovery is shared.
export async function signAndSubmitLoanSet(transaction: SubmittableTransaction, broker: Wallet, borrower: Wallet): Promise<Submitted> {
  if (transaction.Account !== broker.classicAddress) throw new Error("Connect the broker account for this loan.");
  return withSubmissionLock(broker.classicAddress, async () => {
    const c = await getClient();
    const prepared = await c.autofill(transaction);
    if (prepared.NetworkID !== TRACK1.networkId) throw new Error(`Refusing to sign for network ${prepared.NetworkID}.`);
    if (!/^[1-9]\d*$/.test(String(prepared.Fee)) || BigInt(prepared.Fee!) > 1_000_000n) throw new Error("Transaction fee exceeds the 1 XRP signing limit.");
    assertActiveSigner(broker);
    const first = broker.sign(prepared);
    const both = signLoanSetByCounterparty(borrower, first.tx_blob as unknown as LoanSet);
    return submitTracked(c, prepared, both);
  });
}

export function createdEntry(meta: Record<string, unknown>, entryType: string): string | undefined {
  if (!Array.isArray(meta.AffectedNodes)) return undefined;
  for (const value of meta.AffectedNodes) {
    const node = record(value, "affected node");
    if (!node.CreatedNode) continue;
    const created = record(node.CreatedNode, "created node");
    if (created.LedgerEntryType === entryType && typeof created.LedgerIndex === "string") return created.LedgerIndex;
  }
  return undefined;
}

// Human explanations for the result codes this product actually meets. Ambiguous codes say so.
export function explainResult(code: string, context?: "withdraw" | "loanset" | "sale" | "generic"): string {
  switch (code) {
    case "tesSUCCESS":
      return "Validated on the ledger.";
    case "tecINSUFFICIENT_FUNDS":
      if (context === "withdraw") return "The vault does not hold enough available cash for this withdrawal. Your shares are intact; capital is deployed in loans. You can sell your position on Raise instead.";
      if (context === "loanset") return "The ledger reports insufficient funds. This is ambiguous: it means either the broker's first-loss cover is below its minimum or the vault lacks liquidity. Check the broker's cover first.";
      return "Insufficient funds for this operation.";
    case "tecUNFUNDED_PAYMENT":
    case "tecUNFUNDED":
      return "The paying account does not hold enough to cover this payment plus its reserve.";
    case "tecNO_PERMISSION":
      return "This account is not permitted to perform that action on this object.";
    case "tecNO_ENTRY":
      return "The referenced ledger object does not exist. It may have been deleted or the ID is wrong.";
    case "tecPATH_DRY":
      return "The payment could not be delivered. For share transfers, the recipient must first authorise holding this issuance.";
    case "tefPAST_SEQ":
      return "This transaction was already applied or superseded. Nothing was executed twice.";
    case "temINVALID":
      return "The ledger rejected the transaction as malformed but did not say which field. For LoanSet, check GracePeriod is at least 60 seconds and not above PaymentInterval.";
    case "temBAD_SIGNER":
      return "Signature construction is wrong. For LoanSet the broker must sign before the borrower counter-signs.";
    default:
      return `Ledger result ${code}.`;
  }
}
