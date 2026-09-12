import { describe, expect, it } from "vitest";
import { assessSettlement, likelyCause, preflight, type Snapshot } from "@/components/buy/settlement";

const terms = { shares: "1000000", priceDrops: "5000000" };
const before: Snapshot = { buyerShares: "0", sellerShares: "20000000", buyerXrp: "1000000000", sellerXrp: "980000000" };

describe("settlement is judged from ledger state, never from the engine result", () => {
  it("settles only when both legs moved by exactly the agreed amounts", () => {
    const after: Snapshot = { buyerShares: "1000000", sellerShares: "19000000", buyerXrp: "995000000", sellerXrp: "984999940" };
    const v = assessSettlement(before, after, terms);
    expect(v.kind).toBe("settled");
    expect(v.kind === "settled" && v.buyerFeeDrops).toBe("0");
  });
  it("reports nothing-moved when only the outer fee was charged", () => {
    const after: Snapshot = { ...before, sellerXrp: "979999940" };
    expect(assessSettlement(before, after, terms).kind).toBe("nothing-moved");
  });
  it("reports nothing-moved when the ledger is identical", () => {
    expect(assessSettlement(before, before, terms).kind).toBe("nothing-moved");
  });
  it("flags shares delivered without payment as partial", () => {
    const after: Snapshot = { ...before, buyerShares: "1000000", sellerShares: "19000000" };
    expect(assessSettlement(before, after, terms).kind).toBe("partial");
  });
  it("flags payment without delivery as partial", () => {
    const after: Snapshot = { ...before, buyerXrp: "995000000", sellerXrp: "985000000" };
    expect(assessSettlement(before, after, terms).kind).toBe("partial");
  });
  it("does not accept a wrong quantity as settled", () => {
    const after: Snapshot = { buyerShares: "500000", sellerShares: "19500000", buyerXrp: "995000000", sellerXrp: "985000000" };
    expect(assessSettlement(before, after, terms).kind).toBe("partial");
  });
  it("does not accept a large unexplained debit as a fee", () => {
    const after: Snapshot = { ...before, buyerXrp: "900000000" };
    expect(assessSettlement(before, after, terms).kind).toBe("partial");
  });
});

describe("pre-flight", () => {
  const good = { offerState: "open", expiresAt: new Date(Date.now() + 60_000).toISOString(), sellerShares: "20000000", buyerXrp: "1000000000", buyerHasHolder: true, buyerIsSeller: false, terms };
  it("passes a clean offer", () => {
    expect(preflight(good)).toEqual({ ok: true, blockers: [], needsAuthorize: false });
  });
  it("blocks when the seller no longer holds the shares", () => {
    expect(preflight({ ...good, sellerShares: "999999" }).blockers.join(" ")).toMatch(/Seller no longer holds/);
  });
  it("blocks an unaffordable purchase including the margin", () => {
    expect(preflight({ ...good, buyerXrp: "5500000" }).blockers.join(" ")).toMatch(/balance/);
    expect(preflight({ ...good, buyerXrp: "6000000" }).ok).toBe(true);
  });
  it("blocks expired, cancelled and settled offers", () => {
    expect(preflight({ ...good, expiresAt: new Date(Date.now() - 1).toISOString() }).blockers.join(" ")).toMatch(/expired/);
    expect(preflight({ ...good, offerState: "cancelled" }).blockers.join(" ")).toMatch(/cancelled/);
    expect(preflight({ ...good, offerState: "settled" }).blockers.join(" ")).toMatch(/settled/);
  });
  it("blocks the seller buying their own offer", () => {
    expect(preflight({ ...good, buyerIsSeller: true }).blockers.join(" ")).toMatch(/your own/);
  });
  it("asks for holder authorisation instead of blocking", () => {
    const r = preflight({ ...good, buyerHasHolder: false });
    expect(r.ok).toBe(false);
    expect(r.needsAuthorize).toBe(true);
    expect(r.blockers).toEqual([]);
  });
});

describe("likely cause of a cancelled settlement", () => {
  it("names the seller when shares were short", () => {
    expect(likelyCause({ ...before, sellerShares: "1" }, terms)).toMatch(/seller moved shares/);
  });
  it("names the buyer when funds were short", () => {
    expect(likelyCause({ ...before, buyerXrp: "1" }, terms)).toMatch(/balance dropped/);
  });
});
