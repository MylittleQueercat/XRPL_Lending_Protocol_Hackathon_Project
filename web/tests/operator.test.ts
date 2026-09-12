import { describe, expect, it } from "vitest";
import {
  buildLoanBrokerSet, buildLoanPay, buildLoanSet, ceilDrops, fullRepaymentOfferDrops, isLoanDefaulted, isLoanImpaired,
  percentToTenthBps, requiredCoverDrops, TF_LOAN_FULL_PAYMENT, validateLoanTerms,
} from "@/components/operator/lending";

const BROKER = "rzqEAQrkcXMjaKUMYdV6DXT4ybeaDWWjd";
const BORROWER = "rf1shBFJwP5xNgySBYAey4X1txqq839rG1";
const VAULT = "A".repeat(64);
const BROKER_ID = "B".repeat(64);

describe("rate conversion", () => {
  it("turns a percentage into 1/10 bps", () => {
    expect(percentToTenthBps("10")).toBe(10_000);
    expect(percentToTenthBps("100")).toBe(100_000);
    expect(percentToTenthBps("0.5")).toBe(500);
    expect(percentToTenthBps("abc")).toBeNull();
    expect(percentToTenthBps("1.2345")).toBeNull();
  });
});

describe("broker cover", () => {
  it("computes the cover the broker must hold, rounding up", () => {
    expect(requiredCoverDrops("50000000", 10_000)).toBe("5000000");
    expect(requiredCoverDrops("50000000", 100_000)).toBe("50000000");
    expect(requiredCoverDrops("1", 10_000)).toBe("1");
    expect(requiredCoverDrops("0", 10_000)).toBe("0");
  });
  it("shows the proven flow was covered: 20 XRP cover against 50 XRP at 10 %", () => {
    expect(BigInt(requiredCoverDrops("50000000", 10_000)) <= 20_000_000n).toBe(true);
  });
});

describe("loan term bounds the ledger enforces but the SDK does not", () => {
  const ok = { interestRate: 100_000, paymentInterval: 2_592_000, paymentTotal: 12, gracePeriod: 86_400 };
  it("accepts the proven defaults", () => {
    expect(validateLoanTerms(ok)).toEqual([]);
  });
  it("rejects a grace period under 60 seconds and names the opaque ledger error", () => {
    expect(validateLoanTerms({ ...ok, paymentInterval: 60, gracePeriod: 30 }).join(" ")).toMatch(/temINVALID/);
  });
  it("rejects a grace period above the payment interval", () => {
    expect(validateLoanTerms({ ...ok, paymentInterval: 60, gracePeriod: 120 }).join(" ")).toMatch(/exceed/);
  });
  it("caps the interest rate at 100 %", () => {
    expect(validateLoanTerms({ ...ok, interestRate: 100_001 }).join(" ")).toMatch(/Interest/);
  });
  it("requires at least one payment and a 60 second interval", () => {
    expect(validateLoanTerms({ ...ok, paymentTotal: 0 }).join(" ")).toMatch(/Payments total/);
    expect(validateLoanTerms({ ...ok, paymentInterval: 59, gracePeriod: 59 }).join(" ")).toMatch(/interval/);
  });
});

describe("transaction builders mirror the proven flow", () => {
  it("LoanBrokerSet carries the vault and both cover rates", () => {
    const tx = buildLoanBrokerSet(BROKER, VAULT, "1000000000", 10_000, 10_000) as unknown as Record<string, unknown>;
    expect(tx).toMatchObject({ TransactionType: "LoanBrokerSet", Account: BROKER, VaultID: VAULT, ManagementFeeRate: 0, DebtMaximum: "1000000000", CoverRateMinimum: 10_000, CoverRateLiquidation: 10_000 });
  });
  it("LoanSet names the borrower as counterparty and zeroes the fees the flow zeroes", () => {
    const tx = buildLoanSet({ broker: BROKER, borrower: BORROWER, loanBrokerId: BROKER_ID, principalDrops: "50000000", interestRate: 100_000, paymentInterval: 2_592_000, paymentTotal: 12, gracePeriod: 86_400, closePaymentFeeDrops: "5000000" }) as unknown as Record<string, unknown>;
    expect(tx).toMatchObject({ TransactionType: "LoanSet", Account: BROKER, Counterparty: BORROWER, LoanBrokerID: BROKER_ID, PrincipalRequested: "50000000", LoanOriginationFee: "0", LoanServiceFee: "0", ClosePaymentFee: "5000000", CloseInterestRate: 0 });
  });
  it("LoanPay sets the full-payment flag only when asked", () => {
    expect((buildLoanPay(BORROWER, BROKER_ID, "1", false) as unknown as Record<string, unknown>).Flags).toBeUndefined();
    expect((buildLoanPay(BORROWER, BROKER_ID, "1", true) as unknown as Record<string, unknown>).Flags).toBe(TF_LOAN_FULL_PAYMENT);
  });
});

describe("repayment amounts", () => {
  it("rounds fractional ledger amounts up to a whole drop", () => {
    expect(ceilDrops("25000003.56737605411")).toBe("25000004");
    expect(ceilDrops("25000000")).toBe("25000000");
    expect(ceilDrops("25000000.000")).toBe("25000000");
  });
  it("offers outstanding value plus the close fee for an early full repayment", () => {
    expect(fullRepaymentOfferDrops("80523492", "5000000")).toBe("85523492");
    expect(fullRepaymentOfferDrops("80523491.2", "0")).toBe("80523492");
  });
});

describe("loan flags", () => {
  it("reads default and impaired bits", () => {
    expect(isLoanDefaulted(0x10000)).toBe(true);
    expect(isLoanImpaired(0x20000)).toBe(true);
    expect(isLoanDefaulted(0)).toBe(false);
    expect(isLoanImpaired(0x10000)).toBe(false);
  });
});
