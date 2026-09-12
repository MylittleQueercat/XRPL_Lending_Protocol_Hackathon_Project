import { isValidClassicAddress } from "xrpl";
// Public transaction identifiers only. Never persist seeds, signatures or transaction blobs here.
export interface PendingSubmission {
  hash: string;
  account: string;
  transactionType: string;
  networkId: 4001;
  lastLedgerSequence: number;
  createdAt: string;
}
export interface JournalStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export const SUBMISSION_JOURNAL_KEY = "raise.pending-submissions.v1";
export class SubmissionJournal {
  constructor(private readonly storage: JournalStorage) {}
  list(): PendingSubmission[] {
    const raw = this.storage.getItem(SUBMISSION_JOURNAL_KEY);
    if (raw === null) return [];
    const rows: unknown = JSON.parse(raw);
    if (!Array.isArray(rows) || rows.length > 100) throw new Error("Transaction recovery journal is invalid. Review existing transactions before continuing.");
    return rows.map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("Invalid transaction recovery record.");
      const row = entry as PendingSubmission;
      if (Object.keys(row).sort().join(",") !== "account,createdAt,hash,lastLedgerSequence,networkId,transactionType" || !/^[A-F0-9]{64}$/i.test(row.hash) || typeof row.account !== "string" || !isValidClassicAddress(row.account) || !/^[A-Za-z]{1,64}$/.test(row.transactionType) || row.networkId !== 4001 || !Number.isInteger(row.lastLedgerSequence) || row.lastLedgerSequence < 1 || row.lastLedgerSequence > 4_294_967_295 || !Number.isFinite(Date.parse(row.createdAt))) throw new Error("Invalid transaction recovery record.");
      return { ...row };
    });
  }
  assertClear(account: string): void {
    const pending = this.list().find((row) => row.account === account);
    if (pending) throw new Error(`Check saved transaction ${pending.hash} before signing another operation from this account.`);
  }
  record(entry: PendingSubmission): void {
    this.assertClear(entry.account);
    const rows = [...this.list(), entry];
    const candidate = new SubmissionJournal({ getItem: () => JSON.stringify(rows), setItem() {} });
    candidate.list();
    this.storage.setItem(SUBMISSION_JOURNAL_KEY, JSON.stringify(rows));
    if (!this.list().some((row) => row.hash === entry.hash && row.account === entry.account)) throw new Error("Cannot persist transaction recovery. Nothing was submitted.");
  }
  resolveValidated(hash: string): void {
    this.storage.setItem(SUBMISSION_JOURNAL_KEY, JSON.stringify(this.list().filter((row) => row.hash !== hash)));
  }
}
export const SUBMISSION_EVENT = "raise:pending-submissions";
export function browserJournal() {
  if (typeof window === "undefined") throw new Error("Browser transaction recovery storage is required before signing.");
  return new SubmissionJournal(window.localStorage);
}
export function notifySubmissions() { if (typeof window !== "undefined") window.dispatchEvent(new Event(SUBMISSION_EVENT)); }
