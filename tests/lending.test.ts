import { describe, expect, it } from 'vitest';
import { validate } from 'xrpl';
import { buildLoanBrokerSet, buildLoanSet, createdEntry, LOAN_TERMS } from '../src/lending.js';

const VAULT = 'A'.repeat(64);
const BROKER_ID = 'B'.repeat(64);
const BROKER = 'rzqEAQrkcXMjaKUMYdV6DXT4ybeaDWWjd';
const BORROWER = 'rf1shBFJwP5xNgySBYAey4X1txqq839rG1';

describe('XLS-66 transaction builders', () => {
  it('builds a broker the SDK accepts', () => {
    expect(() => validate({ ...buildLoanBrokerSet(BROKER, VAULT) } as Record<string, unknown>)).not.toThrow();
  });
  it('builds an origination the SDK accepts, naming the borrower as counterparty', () => {
    const tx = buildLoanSet(BROKER, BORROWER, BROKER_ID) as Record<string, unknown>;
    expect(() => validate({ ...tx })).not.toThrow();
    expect(tx.Counterparty).toBe(BORROWER);
    expect(tx.Account).toBe(BROKER);
  });
  // The ledger rejects GracePeriod below 60 with temINVALID while xrpl.js 5.2.0 only checks
  // GracePeriod <= PaymentInterval, so the terms must keep both bounds themselves.
  it('keeps loan terms inside the bounds the ledger enforces but the SDK does not', () => {
    expect(LOAN_TERMS.gracePeriod).toBeGreaterThanOrEqual(60);
    expect(LOAN_TERMS.gracePeriod).toBeLessThanOrEqual(LOAN_TERMS.paymentInterval);
    expect(LOAN_TERMS.paymentInterval).toBeGreaterThanOrEqual(60);
    expect(LOAN_TERMS.interestRate).toBeLessThanOrEqual(100000);
  });
  // Cover below the broker's own minimum makes origination fail with tecINSUFFICIENT_FUNDS,
  // the same code the vault returns when it is short of cash.
  it('funds cover above the broker minimum for the configured principal', () => {
    const required = (Number(LOAN_TERMS.principalXrp) * LOAN_TERMS.coverRateMinimum) / 100000;
    expect(Number(LOAN_TERMS.coverXrp)).toBeGreaterThanOrEqual(required);
  });
  it('keeps the principal below the deposited liquidity so the guardrail can reject a full exit', () => {
    // Origination must leave the vault short of a full exit, and lock at least half the
    // capital so the rejection reflects real utilisation rather than a rounding edge.
    expect(Number(LOAN_TERMS.principalXrp)).toBeLessThan(Number(LOAN_TERMS.depositXrp));
    expect(Number(LOAN_TERMS.principalXrp)).toBeGreaterThanOrEqual(Number(LOAN_TERMS.depositXrp) / 2);
  });
});

describe('validated metadata reading', () => {
  it('finds a created entry of the requested type', () => {
    const meta = { AffectedNodes: [{ ModifiedNode: { LedgerEntryType: 'AccountRoot' } }, { CreatedNode: { LedgerEntryType: 'Loan', LedgerIndex: BROKER_ID } }] };
    expect(createdEntry(meta, 'Loan')).toBe(BROKER_ID);
  });
  it('refuses to invent an identifier when nothing was created', () => {
    expect(() => createdEntry({ AffectedNodes: [{ ModifiedNode: { LedgerEntryType: 'Vault' } }] }, 'Loan')).toThrow(/Loan/);
  });
  it('rejects metadata without affected nodes', () => {
    expect(() => createdEntry({}, 'Vault')).toThrow(/affected nodes/);
  });
});
