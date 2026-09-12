// Time series and activity read from the validated ledger.
//
// The Track 1 node keeps full history (complete_ledgers starts at 5), so a vault's past state can
// be read with ledger_entry at any earlier ledger index. That is what the charts show: the real
// net asset value per share and the real cash position over time, never a simulated curve.
import { getClient, isEntryNotFound, record, readVault, type VaultState } from "./ledger";
import { floorAccountingDrops } from "./accounting";

const RIPPLE_EPOCH_MS = 946_684_800_000;
export const rippleTimeToMs = (seconds: number) => seconds * 1000 + RIPPLE_EPOCH_MS;

export interface VaultSample {
  ledgerIndex: number;
  time: number; // ms since epoch, close time of the ledger (interpolated between fetched anchors)
  assetsTotalDrops: string;
  assetsAvailableDrops: string;
  lossUnrealizedDrops: string;
  sharesOutstanding: string;
  navPerShare: number; // drops per raw share unit; 0 when no shares are outstanding
  utilisation: number; // 0..1 share of assets deployed in loans
}

export function navPerShare(assetsTotalDrops: string, lossUnrealizedDrops: string, sharesOutstanding: string): number {
  const shares = Number(sharesOutstanding || "0");
  if (!shares) return 0;
  return (Number(floorAccountingDrops(assetsTotalDrops || "0")) - Number(floorAccountingDrops(lossUnrealizedDrops || "0"))) / shares;
}

export function utilisationOf(assetsTotalDrops: string, assetsAvailableDrops: string): number {
  const total = Number(floorAccountingDrops(assetsTotalDrops || "0"));
  if (!total) return 0;
  const available = Number(floorAccountingDrops(assetsAvailableDrops || "0"));
  return Math.max(0, Math.min(1, (total - available) / total));
}

export function sampleFromVault(vault: VaultState, time = Date.now()): VaultSample {
  return {
    ledgerIndex: vault.ledgerIndex,
    time,
    assetsTotalDrops: vault.assetsTotalDrops,
    assetsAvailableDrops: vault.assetsAvailableDrops,
    lossUnrealizedDrops: vault.lossUnrealizedDrops ?? "0",
    sharesOutstanding: vault.sharesOutstanding,
    navPerShare: navPerShare(vault.assetsTotalDrops, vault.lossUnrealizedDrops ?? "0", vault.sharesOutstanding),
    utilisation: utilisationOf(vault.assetsTotalDrops, vault.assetsAvailableDrops),
  };
}

function isLedgerNotFound(error: unknown): boolean {
  const data = (error as { data?: { error?: string } })?.data;
  return data?.error === "lgrNotFound" || data?.error === "ledgerNotFound";
}

// Vault fields at a past ledger. null when the vault did not exist yet or the ledger is unavailable.
export async function readVaultAt(vaultId: string, ledgerIndex: number): Promise<Omit<VaultSample, "time"> | null> {
  const c = await getClient();
  try {
    const response = await c.request({ command: "ledger_entry", index: vaultId, ledger_index: ledgerIndex });
    const vault = record(response.result.node, "vault");
    if (vault.LedgerEntryType !== "Vault") return null;
    const issuance = record((await c.request({ command: "ledger_entry", mpt_issuance: String(vault.ShareMPTID), ledger_index: ledgerIndex })).result.node, "share issuance");
    const assetsTotalDrops = String(vault.AssetsTotal ?? "0");
    const assetsAvailableDrops = String(vault.AssetsAvailable ?? "0");
    const lossUnrealizedDrops = String(vault.LossUnrealized ?? "0");
    const sharesOutstanding = String(issuance.OutstandingAmount ?? "0");
    return {
      ledgerIndex,
      assetsTotalDrops, assetsAvailableDrops, lossUnrealizedDrops, sharesOutstanding,
      navPerShare: navPerShare(assetsTotalDrops, lossUnrealizedDrops, sharesOutstanding),
      utilisation: utilisationOf(assetsTotalDrops, assetsAvailableDrops),
    };
  } catch (error) {
    if (isEntryNotFound(error) || isLedgerNotFound(error)) return null;
    throw error;
  }
}

export async function readLedgerCloseTime(ledgerIndex: number): Promise<number> {
  const c = await getClient();
  const response = await c.request({ command: "ledger", ledger_index: ledgerIndex });
  const ledger = record(response.result.ledger, "ledger");
  return rippleTimeToMs(Number(ledger.close_time));
}

export async function readValidatedLedgerIndex(): Promise<number> {
  const c = await getClient();
  const info = record((await c.request({ command: "server_info" })).result.info, "server_info");
  return Number(record(info.validated_ledger, "validated ledger").seq);
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  }));
  return results;
}

export interface SampleOptions {
  points?: number; // number of evenly spaced ledgers to sample
  spanLedgers?: number; // how far back from the validated ledger to look
  concurrency?: number;
  // Also sample the exact ledger of every deposit, withdrawal, disbursement and repayment of the
  // vault (and the ledger just before it), so short-lived activity is never missed. Default true.
  includeEvents?: boolean;
}

// Evenly spaced samples of a vault's state over the last `spanLedgers` ledgers, plus one sample at
// (and just before) every ledger where the vault's account moved, so the curve is exact at every
// deposit, withdrawal, disbursement and repayment. Ledgers from before the vault existed are dropped.
// Times come from the transactions' close times and the first and last sampled ledgers, interpolated
// in between (ledgers close every few seconds, so the error is small).
export async function sampleVaultHistory(vaultId: string, options: SampleOptions = {}): Promise<VaultSample[]> {
  const points = Math.max(2, options.points ?? 48);
  const span = Math.max(points, options.spanLedgers ?? 12_000);
  const end = await readValidatedLedgerIndex();
  const start = Math.max(5, end - span);
  const step = Math.max(1, Math.floor((end - start) / (points - 1)));
  const wanted = new Set<number>();
  for (let i = 0; i < points; i++) wanted.add(Math.min(end, start + i * step));
  wanted.add(end);

  // Exact times we know: ledger index -> ms, from the vault account's own transactions.
  const anchors = new Map<number, number>();
  if (options.includeEvents !== false) {
    try {
      const pseudoAccount = String(record((await (await getClient()).request({ command: "ledger_entry", index: vaultId, ledger_index: "validated" })).result.node, "vault").Account);
      const activity = await readAccountActivity(pseudoAccount, 80);
      for (const item of activity) {
        if (item.ledgerIndex < start || item.ledgerIndex > end) continue;
        wanted.add(item.ledgerIndex);
        if (item.ledgerIndex - 1 >= start) wanted.add(item.ledgerIndex - 1);
        if (item.time > 0) anchors.set(item.ledgerIndex, item.time);
      }
    } catch {
      // Activity is an enrichment; the evenly spaced samples still stand on their own.
    }
  }

  const indices = Array.from(wanted).sort((a, b) => a - b).slice(-240);
  const raw = await mapLimit(indices, options.concurrency ?? 6, (index) => readVaultAt(vaultId, index));
  const found = raw.filter((s): s is Omit<VaultSample, "time"> => s !== null);
  if (found.length === 0) return [];
  const firstIndex = found[0].ledgerIndex;
  const lastIndex = found[found.length - 1].ledgerIndex;
  if (!anchors.has(firstIndex)) anchors.set(firstIndex, await readLedgerCloseTime(firstIndex));
  if (!anchors.has(lastIndex)) anchors.set(lastIndex, await readLedgerCloseTime(lastIndex));
  const knots = Array.from(anchors.entries()).sort((a, b) => a[0] - b[0]);
  const timeAt = (index: number): number => {
    let lo = knots[0], hi = knots[knots.length - 1];
    for (const k of knots) { if (k[0] <= index) lo = k; if (k[0] >= index) { hi = k; break; } }
    if (lo[0] === hi[0]) return lo[1];
    return lo[1] + ((index - lo[0]) * (hi[1] - lo[1])) / (hi[0] - lo[0]);
  };
  return found.map((s) => ({ ...s, time: timeAt(s.ledgerIndex) }));
}

// ---------------------------------------------------------------------------------------------
// Account activity (account_tx)
// ---------------------------------------------------------------------------------------------

export type ActivityKind =
  | "VaultCreate" | "VaultDeposit" | "VaultWithdraw" | "LoanBrokerSet" | "LoanBrokerCoverDeposit" | "LoanSet" | "LoanPay"
  | "Batch" | "Payment" | "MPTokenAuthorize" | "Other";

export interface ActivityItem {
  hash: string;
  ledgerIndex: number;
  time: number; // ms
  type: string;
  kind: ActivityKind;
  resultCode: string;
  initiator: string;
  // Signed XRP change of the queried account in this transaction, in drops. Fees included.
  xrpDeltaDrops: string;
  vaultId?: string;
  loanId?: string;
  loanBrokerId?: string;
  amountDrops?: string; // Amount field when it is an XRP amount
}

const KINDS: ActivityKind[] = ["VaultCreate", "VaultDeposit", "VaultWithdraw", "LoanBrokerSet", "LoanBrokerCoverDeposit", "LoanSet", "LoanPay", "Batch", "Payment", "MPTokenAuthorize"];

function balanceDelta(meta: Record<string, unknown>, account: string): string {
  if (!Array.isArray(meta.AffectedNodes)) return "0";
  for (const value of meta.AffectedNodes) {
    const node = record(value, "affected node");
    const modified = node.ModifiedNode ? record(node.ModifiedNode, "modified node") : null;
    if (modified && modified.LedgerEntryType === "AccountRoot") {
      const final = record(modified.FinalFields ?? {}, "final fields");
      if (final.Account !== account) continue;
      const previous = record(modified.PreviousFields ?? {}, "previous fields");
      if (typeof previous.Balance !== "string") return "0";
      return (BigInt(String(final.Balance ?? "0")) - BigInt(previous.Balance)).toString();
    }
    const created = node.CreatedNode ? record(node.CreatedNode, "created node") : null;
    if (created && created.LedgerEntryType === "AccountRoot") {
      const fields = record(created.NewFields ?? {}, "new fields");
      if (fields.Account === account) return String(fields.Balance ?? "0");
    }
  }
  return "0";
}

// The most recent transactions that touched an account, newest first. Works for user wallets and
// for vault pseudo-accounts (whose activity is every deposit, withdrawal, disbursement and repayment).
export async function readAccountActivity(account: string, limit = 40): Promise<ActivityItem[]> {
  const c = await getClient();
  let response;
  try {
    response = await c.request({ command: "account_tx", account, limit, ledger_index_min: -1, ledger_index_max: -1 });
  } catch (error) {
    if ((error as { data?: { error?: string } })?.data?.error === "actNotFound") return [];
    throw error;
  }
  const items: ActivityItem[] = [];
  for (const entry of response.result.transactions ?? []) {
    const wrapper = entry as unknown as Record<string, unknown>;
    const tx = record(wrapper.tx_json ?? wrapper.tx ?? {}, "transaction");
    const meta = typeof wrapper.meta === "object" && wrapper.meta ? (wrapper.meta as Record<string, unknown>) : {};
    const type = String(tx.TransactionType ?? "Other");
    const ledgerIndex = Number(wrapper.ledger_index ?? tx.ledger_index ?? 0);
    const closeIso = typeof wrapper.close_time_iso === "string" ? Date.parse(wrapper.close_time_iso) : NaN;
    const time = Number.isFinite(closeIso) ? closeIso : typeof tx.date === "number" ? rippleTimeToMs(tx.date) : 0;
    const amount = tx.Amount;
    items.push({
      hash: String(wrapper.hash ?? tx.hash ?? ""),
      ledgerIndex,
      time,
      type,
      kind: (KINDS as string[]).includes(type) ? (type as ActivityKind) : "Other",
      resultCode: String(meta.TransactionResult ?? "unknown"),
      initiator: String(tx.Account ?? ""),
      xrpDeltaDrops: balanceDelta(meta, account),
      ...(typeof tx.VaultID === "string" ? { vaultId: tx.VaultID } : {}),
      ...(typeof tx.LoanID === "string" ? { loanId: tx.LoanID } : {}),
      ...(typeof tx.LoanBrokerID === "string" ? { loanBrokerId: tx.LoanBrokerID } : {}),
      ...(typeof amount === "string" && /^\d+$/.test(amount) ? { amountDrops: amount } : {}),
    });
  }
  return items.sort((a, b) => b.ledgerIndex - a.ledgerIndex);
}

// Convenience: the latest state plus the history, for screens that show both.
export async function readVaultWithHistory(vaultId: string, options?: SampleOptions): Promise<{ vault: VaultState; samples: VaultSample[] }> {
  const [vault, samples] = await Promise.all([readVault(vaultId), sampleVaultHistory(vaultId, options)]);
  return { vault, samples };
}
