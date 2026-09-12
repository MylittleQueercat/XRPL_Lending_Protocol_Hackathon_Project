import { describe, expect, it } from "vitest";
import { Wallet } from "xrpl";
import { SubmissionJournal, SUBMISSION_JOURNAL_KEY, type PendingSubmission } from "@/lib/submission-journal";

const entry: PendingSubmission = { hash: "A".repeat(64), account: Wallet.generate().classicAddress, transactionType: "VaultDeposit", networkId: 4001, lastLedgerSequence: 100, createdAt: new Date().toISOString() };
function storage() { const rows = new Map<string,string>(); return { getItem: (key: string) => rows.get(key) ?? null, setItem: (key: string, value: string) => { rows.set(key,value); } }; }
describe("pending transaction recovery", () => {
  it("survives a reload and blocks another operation from the same account", () => {
    const disk = storage(); new SubmissionJournal(disk).record(entry);
    const reloaded = new SubmissionJournal(disk);
    expect(reloaded.list()).toEqual([entry]);
    expect(() => reloaded.assertClear(entry.account)).toThrow(/saved transaction/);
    expect(() => reloaded.record({ ...entry, hash: "B".repeat(64) })).toThrow();
  });
  it("keeps other accounts pending when one exact transaction resolves", () => {
    const journal = new SubmissionJournal(storage()); journal.record(entry);
    const other = { ...entry, hash: "B".repeat(64), account: Wallet.generate().classicAddress };
    journal.record(other); journal.resolveValidated(entry.hash);
    expect(journal.list()).toEqual([other]);
  });
  it("refuses operation when storage cannot persist the hash", () => {
    const journal = new SubmissionJournal({ getItem: () => null, setItem() {} });
    expect(() => journal.record(entry)).toThrow(/persist/);
  });
  it("does not discard corrupt records to unlock more spending", () => {
    const disk = storage(); disk.setItem(SUBMISSION_JOURNAL_KEY, "broken-json");
    expect(() => new SubmissionJournal(disk).assertClear(entry.account)).toThrow();
  });
  it("rejects extra credential fields rather than storing them", () => {
    const journal = new SubmissionJournal(storage());
    expect(() => journal.record({ ...entry, seed: "not-a-secret-test-marker" } as PendingSubmission)).toThrow();
  });
  it("rejects a syntactically plausible address with a broken checksum", () => {
    const journal = new SubmissionJournal(storage());
    expect(() => journal.record({ ...entry, account: "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTi" })).toThrow();
  });
});
