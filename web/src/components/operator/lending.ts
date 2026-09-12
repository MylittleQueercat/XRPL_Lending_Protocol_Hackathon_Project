// Pure lending logic for the operator console. Mirrors the transaction shapes and defaults proven
// by `npm run vanilla` at the repository root (src/lending.ts). No network access here.
import type { SubmittableTransaction } from "xrpl";

// Ledger rates are expressed in 1/10 basis points: 100000 = 100 %.
export const RATE_DENOMINATOR = 100_000;
export const MAX_INTEREST_RATE = 100_000;
export const MIN_PAYMENT_INTERVAL = 60;
// The ledger enforces this lower bound but xrpl.js 5.2.0 does not, so a smaller value only fails
// on submission with an opaque temINVALID.
export const MIN_GRACE_PERIOD = 60;

export const LSF_LOAN_DEFAULT = 0x00010000;
export const LSF_LOAN_IMPAIRED = 0x00020000;
export const TF_LOAN_FULL_PAYMENT = 0x00020000;

// Defaults from the proven flow. Typed widely so form state initialised from them stays `string`.
export interface LendingDefaults {
  principalXrp: string; interestPercent: string; paymentInterval: number; paymentTotal: string; gracePeriod: number;
  closePaymentFeeXrp: string; coverXrp: string; debtMaximumXrp: string; coverRateMinimumPercent: string; coverRateLiquidationPercent: string;
}
export const DEFAULTS: Readonly<LendingDefaults> = Object.freeze({
  principalXrp: "50",
  interestPercent: "100",
  paymentInterval: 2_592_000,
  paymentTotal: "12",
  gracePeriod: 86_400,
  closePaymentFeeXrp: "5",
  coverXrp: "20",
  debtMaximumXrp: "1000",
  coverRateMinimumPercent: "10",
  coverRateLiquidationPercent: "10",
});

export const INTERVAL_OPTIONS: ReadonlyArray<{ label: string; seconds: number }> = [
  { label: "60 seconds", seconds: 60 },
  { label: "1 hour", seconds: 3_600 },
  { label: "1 day", seconds: 86_400 },
  { label: "30 days", seconds: 2_592_000 },
];

// Percent typed by a user -> 1/10 bps. "10" -> 10000, "0.5" -> 500. Rejects malformed input.
export function percentToTenthBps(value: string): number | null {
  const trimmed = value.trim();
  if (!/^(0|[1-9]\d*)(\.\d{1,3})?$/.test(trimmed)) return null;
  const [whole = "0", frac = ""] = trimmed.split(".");
  return Number(whole) * 1000 + Number(frac.padEnd(3, "0"));
}

export function tenthBpsToPercent(rate: number): string {
  return `${(rate / 1000).toFixed(rate % 1000 === 0 ? 0 : 2)} %`;
}

// Cover the broker must hold before it can originate `principalDrops`, rounded up.
export function requiredCoverDrops(principalDrops: string, coverRateMinimum: number): string {
  const principal = BigInt(principalDrops || "0");
  const rate = BigInt(coverRateMinimum);
  const denominator = BigInt(RATE_DENOMINATOR);
  return ((principal * rate + denominator - 1n) / denominator).toString();
}

export interface LoanTermsInput {
  interestRate: number; // 1/10 bps
  paymentInterval: number;
  paymentTotal: number;
  gracePeriod: number;
}

// Bounds the ledger enforces. Listed so the user sees them before submitting, since the ledger
// itself only answers temINVALID without naming the field.
export function validateLoanTerms(terms: LoanTermsInput): string[] {
  const errors: string[] = [];
  if (!Number.isInteger(terms.interestRate) || terms.interestRate < 0 || terms.interestRate > MAX_INTEREST_RATE) errors.push(`Interest rate must be between 0 and 100 % (${MAX_INTEREST_RATE} in 1/10 bps).`);
  if (!Number.isInteger(terms.paymentInterval) || terms.paymentInterval < MIN_PAYMENT_INTERVAL) errors.push(`Payment interval must be at least ${MIN_PAYMENT_INTERVAL} seconds.`);
  if (!Number.isInteger(terms.paymentTotal) || terms.paymentTotal < 1) errors.push("Payments total must be a positive whole number.");
  if (!Number.isInteger(terms.gracePeriod) || terms.gracePeriod < MIN_GRACE_PERIOD) errors.push(`Grace period must be at least ${MIN_GRACE_PERIOD} seconds; the ledger rejects less with temINVALID and does not say why.`);
  if (terms.gracePeriod > terms.paymentInterval) errors.push("Grace period must not exceed the payment interval.");
  return errors;
}

export function buildVaultCreate(account: string): SubmittableTransaction {
  return { TransactionType: "VaultCreate", Account: account, Asset: { currency: "XRP" }, Flags: 0, WithdrawalPolicy: 1 } as SubmittableTransaction;
}

export function buildVaultDeposit(account: string, vaultId: string, amountDrops: string): SubmittableTransaction {
  return { TransactionType: "VaultDeposit", Account: account, VaultID: vaultId, Amount: amountDrops } as SubmittableTransaction;
}

export function buildLoanBrokerSet(account: string, vaultId: string, debtMaximumDrops: string, coverRateMinimum: number, coverRateLiquidation: number): SubmittableTransaction {
  return {
    TransactionType: "LoanBrokerSet", Account: account, VaultID: vaultId, ManagementFeeRate: 0,
    DebtMaximum: debtMaximumDrops, CoverRateMinimum: coverRateMinimum, CoverRateLiquidation: coverRateLiquidation,
  } as SubmittableTransaction;
}

export function buildLoanBrokerCoverDeposit(account: string, loanBrokerId: string, amountDrops: string): SubmittableTransaction {
  return { TransactionType: "LoanBrokerCoverDeposit", Account: account, LoanBrokerID: loanBrokerId, Amount: amountDrops } as SubmittableTransaction;
}

export interface LoanSetInput extends LoanTermsInput {
  broker: string;
  borrower: string;
  loanBrokerId: string;
  principalDrops: string;
  closePaymentFeeDrops: string;
}

export function buildLoanSet(input: LoanSetInput): SubmittableTransaction {
  return {
    TransactionType: "LoanSet", Account: input.broker, Counterparty: input.borrower, LoanBrokerID: input.loanBrokerId,
    PrincipalRequested: input.principalDrops, InterestRate: input.interestRate, PaymentInterval: input.paymentInterval,
    PaymentTotal: input.paymentTotal, GracePeriod: input.gracePeriod, LoanOriginationFee: "0", LoanServiceFee: "0",
    ClosePaymentFee: input.closePaymentFeeDrops, CloseInterestRate: 0,
  } as SubmittableTransaction;
}

export function buildLoanPay(borrower: string, loanId: string, amountDrops: string, fullPayment: boolean): SubmittableTransaction {
  const tx: Record<string, unknown> = { TransactionType: "LoanPay", Account: borrower, LoanID: loanId, Amount: amountDrops };
  if (fullPayment) tx.Flags = TF_LOAN_FULL_PAYMENT;
  return tx as unknown as SubmittableTransaction;
}

// Ledger amounts on Loan objects may carry a fractional part (PeriodicPayment does). Round up to a
// whole drop so an offer never falls short by rounding.
export function ceilDrops(value: string): string {
  const [whole = "0", frac = ""] = value.split(".");
  const base = BigInt(whole || "0");
  return (/[1-9]/.test(frac) ? base + 1n : base).toString();
}

// What to offer for an early full repayment: everything outstanding plus the close fee. The ledger
// caps the charge at principal + interest accrued to date + fee, so offering more is safe.
export function fullRepaymentOfferDrops(totalValueOutstanding: string, closePaymentFeeDrops: string): string {
  return (BigInt(ceilDrops(totalValueOutstanding)) + BigInt(closePaymentFeeDrops || "0")).toString();
}

export function isLoanDefaulted(flags: number): boolean {
  return (flags & LSF_LOAN_DEFAULT) !== 0;
}

export function isLoanImpaired(flags: number): boolean {
  return (flags & LSF_LOAN_IMPAIRED) !== 0;
}

export function isEntryNotFound(error: unknown): boolean {
  const data = (error as { data?: { error?: string } })?.data;
  return data?.error === "entryNotFound" || /not found|does not exist/i.test((error as Error)?.message ?? "");
}

export function formatDuration(seconds: number): string {
  if (seconds % 86_400 === 0) return `${seconds / 86_400} d`;
  if (seconds % 3_600 === 0) return `${seconds / 3_600} h`;
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  return `${seconds} s`;
}
