import { describe, expect, it } from "vitest";
import { describeVsValue, filterOffers, isBuyable, sellerCanDeliver, utilisationRatio } from "@/components/market/pricing";
import type { Offer } from "@/lib/offers";

const future = new Date(Date.now() + 3_600_000).toISOString();
const past = new Date(Date.now() - 1000).toISOString();
const offer: Offer = {
  id: "o1", network: 4001, vaultId: "A".repeat(64), shareMptId: "B".repeat(48), seller: "rSeller", shares: "1000000", priceDrops: "950000000",
  createdAt: new Date().toISOString(), expiresAt: future, state: "open",
};

describe("price against accounting value", () => {
  it("labels a price below value as a discount, never as yield", () => {
    const v = describeVsValue("950000000", "1000000000");
    expect(v.kind).toBe("discount");
    expect(v.label).toBe("−5.0 %");
  });
  it("labels a price above value as a premium", () => {
    const v = describeVsValue("1050000000", "1000000000");
    expect(v.kind).toBe("premium");
    expect(v.label).toBe("+5.0 %");
  });
  it("reports par and unknown distinctly", () => {
    expect(describeVsValue("1000000000", "1000000000").kind).toBe("par");
    expect(describeVsValue("1", "0").kind).toBe("unknown");
    expect(describeVsValue("1", null).label).toBe("—");
  });
});

describe("vault utilisation", () => {
  it("is the deployed share of total assets, clamped to [0, 1]", () => {
    expect(utilisationRatio({ assetsTotalDrops: "100000000", assetsAvailableDrops: "50000000" })).toBeCloseTo(0.5);
    expect(utilisationRatio({ assetsTotalDrops: "0", assetsAvailableDrops: "0" })).toBe(0);
    expect(utilisationRatio({ assetsTotalDrops: "100", assetsAvailableDrops: "150" })).toBe(0);
  });
});

describe("stale offers", () => {
  it("detects a seller who can no longer deliver the listed quantity", () => {
    expect(sellerCanDeliver("999999", "1000000")).toBe(false);
    expect(sellerCanDeliver("1000000", "1000000")).toBe(true);
    expect(sellerCanDeliver(null, "1")).toBeNull();
  });
  it("blocks buying when the seller is short, the offer expired or closed, or it is the viewer's own", () => {
    expect(isBuyable(offer, true, "rBuyer").ok).toBe(true);
    expect(isBuyable(offer, false, "rBuyer").reason).toMatch(/no longer holds/);
    expect(isBuyable({ ...offer, expiresAt: past }, true, "rBuyer").reason).toMatch(/expired/);
    expect(isBuyable({ ...offer, state: "settled" }, true, "rBuyer").reason).toMatch(/settled/);
    expect(isBuyable(offer, true, "rSeller").reason).toMatch(/your offer/);
    expect(isBuyable(offer, null, "rBuyer").ok).toBe(false);
  });
});

describe("filters", () => {
  const offers: Offer[] = [offer, { ...offer, id: "o2", state: "settled" }, { ...offer, id: "o3", state: "cancelled" }];
  it("defaults to open and can widen", () => {
    expect(filterOffers(offers, "open").map((o) => o.id)).toEqual(["o1"]);
    expect(filterOffers(offers, "settled").map((o) => o.id)).toEqual(["o2"]);
    expect(filterOffers(offers, "all")).toHaveLength(3);
  });
});
