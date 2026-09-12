import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeReview, expiryFromHours } from "@/components/sell/review";

const vault = { vaultId: "A".repeat(64), shareMptId: "B".repeat(48), assetsTotalDrops: "100000188", sharesOutstanding: "100000000" };
const ctx = { vault, seller: "rzqEAQrkcXMjaKUMYdV6DXT4ybeaDWWjd", balance: "100000000", networkId: 4001, now: Date.parse("2026-09-12T16:00:00Z") };

describe("sell review", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(ctx.now);
  });
  afterEach(() => vi.useRealTimers());

  it("prices a valid offer exactly and reports the discount against accounting value", () => {
    const { errors, review } = computeReview({ shares: "50000000", priceXrp: "47.5", expiryHours: 24 }, ctx);
    expect(errors.general).toEqual([]);
    expect(review?.priceDrops).toBe("47500000");
    // 50,000,000 of 100,000,000 units against 100.000188 XRP of assets: exact integer division.
    expect(review?.accountingValueDrops).toBe("50000094");
    expect(review?.unitPriceXrp).toBe("0.95");
    expect(review?.discount).toBeCloseTo((50000094 - 47500000) / 50000094, 6);
    expect(review?.expiresAt).toBe(expiryFromHours(24, ctx.now));
  });
  it("flags a premium as a negative discount rather than hiding it", () => {
    const { review } = computeReview({ shares: "50000000", priceXrp: "60", expiryHours: 1 }, ctx);
    expect(review?.discount).toBeLessThan(0);
  });
  it("refuses more units than the seller holds on the ledger", () => {
    const { errors, review } = computeReview({ shares: "100000001", priceXrp: "1", expiryHours: 6 }, ctx);
    expect(errors.shares).toMatch(/fewer units/);
    expect(review).toBeNull();
  });
  it("refuses non-integer shares and non-positive or over-precise prices", () => {
    expect(computeReview({ shares: "1.5", priceXrp: "1", expiryHours: 1 }, ctx).errors.shares).toBeTruthy();
    expect(computeReview({ shares: "0", priceXrp: "1", expiryHours: 1 }, ctx).errors.shares).toBeTruthy();
    expect(computeReview({ shares: "1", priceXrp: "0", expiryHours: 1 }, ctx).errors.price).toBeTruthy();
    expect(computeReview({ shares: "1", priceXrp: "1.0000001", expiryHours: 1 }, ctx).errors.price).toBeTruthy();
  });
  it("carries the offer model's own validation errors", () => {
    const { errors, review } = computeReview({ shares: "1", priceXrp: "1", expiryHours: 1 }, { ...ctx, seller: "not-an-address" });
    expect(errors.general.join(" ")).toMatch(/Seller/);
    expect(review).toBeNull();
  });
  it("rejects a stale holding when the vault supply has already been redeemed", () => {
    const { errors, review } = computeReview(
      { shares: "1", priceXrp: "1", expiryHours: 1 },
      { ...ctx, vault: { ...vault, sharesOutstanding: "0", assetsTotalDrops: "0" }, balance: "1" },
    );
    expect(review).toBeNull();
    expect(errors.general.join(" ")).toMatch(/supply changed/);
  });
});
