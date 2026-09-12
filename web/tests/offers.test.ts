import { describe, expect, it } from "vitest";
import { canTransition, discountRatio, unitPriceDrops, validateOfferInput, withDerivedState, type Offer } from "@/lib/offers";

const base: Offer = {
  id: "x", network: 4001, vaultId: "A".repeat(64), shareMptId: "B".repeat(48), seller: "rzqEAQrkcXMjaKUMYdV6DXT4ybeaDWWjd",
  shares: "1000000", priceDrops: "5000000", createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3_600_000).toISOString(), state: "open",
};

describe("offer lifecycle", () => {
  it("only allows the documented transitions", () => {
    expect(canTransition("open", "settling")).toBe(true);
    expect(canTransition("open", "cancelled")).toBe(true);
    expect(canTransition("settled", "open")).toBe(false);
    expect(canTransition("cancelled", "settling")).toBe(false);
    expect(canTransition("settling", "open")).toBe(true); // rollback when settlement provably did not execute
  });
  it("derives expiry on read so a stale offer never looks open", () => {
    const stale = { ...base, expiresAt: new Date(Date.now() - 1000).toISOString() };
    expect(withDerivedState(stale).state).toBe("expired");
    expect(withDerivedState(base).state).toBe("open");
  });
  it("refuses offers for the wrong network or malformed identifiers", () => {
    expect(validateOfferInput(base, 4001)).toEqual([]);
    expect(validateOfferInput({ ...base, network: 1 }, 4001).join(" ")).toMatch(/network/);
    expect(validateOfferInput({ ...base, vaultId: "nope" }, 4001).join(" ")).toMatch(/Vault ID/);
    expect(validateOfferInput({ ...base, shares: "0" }, 4001).join(" ")).toMatch(/Shares/);
  });
});

describe("pricing", () => {
  it("computes an exact unit price", () => {
    expect(unitPriceDrops({ priceDrops: "5000000", shares: "1000000" })).toBe("5");
    expect(unitPriceDrops({ priceDrops: "1", shares: "3" })).toBe("0.333333");
  });
  it("reports discount against accounting value, positive when below", () => {
    expect(discountRatio("950000000", "1000000000")).toBeCloseTo(0.05);
    expect(discountRatio("1050000000", "1000000000")).toBeCloseTo(-0.05);
    expect(discountRatio("1", "0")).toBeNull();
  });
});
