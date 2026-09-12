import { describe, expect, it } from "vitest";
import { Wallet, BatchFlags, GlobalFlags, decode, verifySignature } from "xrpl";
import { validateMarketChallenge } from "@/lib/market-client";
import { validatePreparedSale, signBuyerSale, signSellerSale } from "@/lib/market-signing";
import type { MarketAction, MarketAttempt, MarketChallenge } from "@/lib/market-contract";
import type { Offer } from "@/lib/offers";

const seller = Wallet.generate();
const buyer = Wallet.generate();
const offer: Offer = { id: "offer-1", network: 4001, vaultId: "A".repeat(64), shareMptId: "B".repeat(48), seller: seller.classicAddress, shares: "1000000", priceDrops: "950000", createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 600000).toISOString(), state: "settling" };
function prepared(): MarketAttempt {
  const inner = { TransactionType: "Payment", Flags: GlobalFlags.tfInnerBatchTxn, NetworkID: 4001, Fee: "0", SigningPubKey: "" };
  return { offerId: offer.id, id: "attempt-1", buyer: buyer.classicAddress, status: "awaiting-buyer", hash: null, message: null, lastLedgerSequence: 120, batch: { TransactionType: "Batch", Account: seller.classicAddress, Flags: BatchFlags.tfAllOrNothing, NetworkID: 4001, Sequence: 5, LastLedgerSequence: 120, Fee: "60", RawTransactions: [ { RawTransaction: { ...inner, Account: buyer.classicAddress, Destination: seller.classicAddress, Amount: offer.priceDrops, Sequence: 3 } }, { RawTransaction: { ...inner, Account: seller.classicAddress, Destination: buyer.classicAddress, Amount: { mpt_issuance_id: offer.shareMptId, value: offer.shares }, Sequence: 6 } } ] } };
}
const action: MarketAction = { type: "prepare", offerId: offer.id };
const origin = "http://localhost:3100";
function challenge(): MarketChallenge {
  const id = "test-nonce"; const expiresAt = new Date(Date.now() + 120000).toISOString();
  return { id, expiresAt, message: JSON.stringify({ domain: "Raise Marketplace Intent", version: 1, origin, networkId: 4001, account: buyer.classicAddress, nonce: id, expiresAt, action }) };
}
describe("reviewed application intent", () => {
  it("accepts the exact action and own account", () => { expect(() => validateMarketChallenge(challenge(), action, buyer.classicAddress, origin)).not.toThrow(); });
  it.each(["origin", "account", "networkId", "action"])("rejects changed %s", (key) => {
    const c = challenge(); const message = JSON.parse(c.message); message[key] = "different"; c.message = JSON.stringify(message);
    expect(() => validateMarketChallenge(c, action, buyer.classicAddress, origin)).toThrow();
  });
  it("binds the returned challenge ID to the signed nonce", () => {
    const c = challenge(); c.id = "other-nonce";
    expect(() => validateMarketChallenge(c, action, buyer.classicAddress, origin)).toThrow();
  });
});
describe("separate sale signatures", () => {
  it("combines only each participant's own signature without sharing keys", () => {
    const a = prepared(); const signedByBuyer = signBuyerSale(offer, a, buyer);
    const blob = signSellerSale(offer, { ...a, batch: signedByBuyer, status: "awaiting-seller" }, seller);
    expect(verifySignature(blob)).toBe(true);
    expect(decode(blob).Account).toBe(seller.classicAddress);
    expect(a.batch?.BatchSigners).toBeUndefined();
  });
  it("rejects a different wallet", () => { expect(() => signBuyerSale(offer, prepared(), seller)).toThrow(); });
  it("binds preparation to its offer", () => { expect(() => validatePreparedSale(offer, { ...prepared(), offerId: "other-offer" })).toThrow(); });
  it("rejects a displayed offer on another network", () => { expect(() => validatePreparedSale({ ...offer, network: 1 }, prepared())).toThrow(); });
  it("bounds sequences to the ledger uint32 range", () => {
    const a = prepared(); a.batch!.Sequence = 4294967296;
    expect(() => validatePreparedSale(offer, a)).toThrow();
  });
  it.each(["DestinationTag", "SendMax", "Paths"])("rejects unexpected %s before signing", (key) => {
    const a = prepared(); const legs = a.batch!.RawTransactions as Array<{RawTransaction: Record<string,unknown>}>; legs[0].RawTransaction[key] = 1;
    expect(() => validatePreparedSale(offer, a)).toThrow();
  });
  it("rejects a changed payment amount", () => {
    const a = prepared(); const legs = a.batch!.RawTransactions as Array<{RawTransaction: Record<string,unknown>}>; legs[0].RawTransaction.Amount = "950001";
    expect(() => validatePreparedSale(offer, a)).toThrow();
  });
});
