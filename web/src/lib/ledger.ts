// Browser-side ledger access for the Track 1 hackathon network.
//
// Reads go straight to the validated ledger over WebSocket. Nothing here trusts a submission
// result on its own: callers re-read state after a transaction validates, which is the only way to
// tell a settled sale from an outer tesSUCCESS over inner legs that never executed.
import {
  BatchFlags,
  Client,
  GlobalFlags,
  Wallet,
  signLoanSetByCounterparty,
  signMultiBatch,
  type LoanSet,
  type SubmittableTransaction,
} from "xrpl";
import { TRACK1 } from "./network";

let client: Client | null = null;
let connecting: Promise<Client> | null = null;

export async function getClient(): Promise<Client> {
  if (client?.isConnected()) return client;
  if (connecting) return connecting;
  connecting = (async () => {
    const next = new Client(TRACK1.wsUrl, { connectionTimeout: 15_000, timeout: 20_000 });
    await next.connect();
    client = next;
    connecting = null;
    return next;
  })();
  return connecting;
}

export async function disconnect() {
  if (client?.isConnected()) await client.disconnect();
  client = null;
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
  return String(value ?? "0").split(".")[0] || "0";
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
export function shareValueDrops(shares: string, vault: Pick<VaultState, "assetsTotalDrops" | "sharesOutstanding">): string {
  const outstanding = BigInt(vault.sharesOutstanding);
  if (outstanding === 0n) return "0";
  return ((BigInt(shares) * BigInt(vault.assetsTotalDrops)) / outstanding).toString();
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
  totalValueOutstandingDrops: string; // whole drops, floored from the ledger's fractional string
  scheduledInterestRemainingDrops: string;
  periodicPaymentDrops: string; // whole drops, floored
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
  const total = wholeDrops(loan.TotalValueOutstanding);
  return {
    loanId,
    loanBrokerId: String(loan.LoanBrokerID),
    borrower: String(loan.Borrower),
    principalOutstandingDrops: principal,
    totalValueOutstandingDrops: total,
    scheduledInterestRemainingDrops: (BigInt(total) - BigInt(principal)).toString(),
    periodicPaymentDrops: wholeDrops(loan.PeriodicPayment),
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

// Loans where the account is broker owner or borrower, from its owner directory.
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
export async function signAndSubmit(transaction: SubmittableTransaction, wallet: Wallet): Promise<Submitted> {
  const c = await getClient();
  const prepared = await c.autofill(transaction);
  if (prepared.NetworkID !== TRACK1.networkId) throw new Error(`Refusing to sign for network ${prepared.NetworkID}; this app is fixed to ${TRACK1.networkId}.`);
  const signed = wallet.sign(prepared);
  try {
    const result = (await c.submitAndWait(signed.tx_blob)).result;
    const meta = record(result.meta, "transaction metadata");
    return { hash: String(result.hash), ledgerIndex: Number(result.ledger_index), resultCode: String(meta.TransactionResult), validated: result.validated === true, meta };
  } catch (error) {
    // xrpl.js throws on tem/tef results before they reach a ledger. Surface them as a result code.
    const message = (error as Error).message ?? "";
    const match = message.match(/\b(te[cfmrs][A-Z_]+)\b/);
    if (match) return { hash: signed.hash, ledgerIndex: 0, resultCode: match[1], validated: false, meta: {} };
    throw error;
  }
}

// LoanSet needs two signatures: the broker (Account) first, then the borrower as counterparty.
export async function signAndSubmitLoanSet(transaction: SubmittableTransaction, broker: Wallet, borrower: Wallet): Promise<Submitted> {
  const c = await getClient();
  const prepared = await c.autofill(transaction);
  if (prepared.NetworkID !== TRACK1.networkId) throw new Error(`Refusing to sign for network ${prepared.NetworkID}.`);
  const first = broker.sign(prepared);
  const both = signLoanSetByCounterparty(borrower, first.tx_blob as unknown as LoanSet);
  const result = (await c.submitAndWait(both.tx_blob)).result;
  const meta = record(result.meta, "transaction metadata");
  return { hash: String(result.hash), ledgerIndex: Number(result.ledger_index), resultCode: String(meta.TransactionResult), validated: result.validated === true, meta };
}

// Atomic sale: buyer pays XRP, seller delivers shares, all-or-nothing. The buyer signs their inner
// leg; the seller signs the outer Batch. Either wallet may be the local one; the other must be
// available for signing too, which on this network means both are local dev wallets.
export function buildSaleBatch(seller: string, buyer: string, shareMptId: string, priceDrops: string, shares: string): SubmittableTransaction {
  return {
    TransactionType: "Batch",
    Account: seller,
    Flags: BatchFlags.tfAllOrNothing,
    RawTransactions: [
      { RawTransaction: { TransactionType: "Payment", Account: buyer, Destination: seller, Amount: priceDrops, Flags: GlobalFlags.tfInnerBatchTxn } },
      { RawTransaction: { TransactionType: "Payment", Account: seller, Destination: buyer, Amount: { mpt_issuance_id: shareMptId, value: shares }, Flags: GlobalFlags.tfInnerBatchTxn } },
    ],
  } as unknown as SubmittableTransaction;
}

export async function signAndSubmitSale(batch: SubmittableTransaction, seller: Wallet, buyer: Wallet): Promise<Submitted> {
  const c = await getClient();
  const prepared = await c.autofill(batch, 1);
  if (prepared.NetworkID !== TRACK1.networkId) throw new Error(`Refusing to sign for network ${prepared.NetworkID}.`);
  signMultiBatch(buyer, prepared as never);
  const signed = seller.sign(prepared);
  const result = (await c.submitAndWait(signed.tx_blob)).result;
  const meta = record(result.meta, "transaction metadata");
  return { hash: String(result.hash), ledgerIndex: Number(result.ledger_index), resultCode: String(meta.TransactionResult), validated: result.validated === true, meta };
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
