// Pure decision logic for the purchase flow. No ledger access here so it can be tested exactly.
//
// The engine result of a Batch is not evidence that a sale happened: an outer tesSUCCESS can sit
// over inner legs that did not execute. The only acceptable proof is that both economic legs moved
// by exactly the agreed amounts between two validated snapshots.

export interface Snapshot {
  buyerShares: string;
  sellerShares: string;
  buyerXrp: string;
  sellerXrp: string;
  ledgerIndex?: number;
}

export interface Terms {
  shares: string;
  priceDrops: string;
}

export type SettlementVerdict =
  | { kind: "settled"; buyerFeeDrops: string }
  | { kind: "nothing-moved" }
  | { kind: "partial"; detail: string };

// Outer Batch fee plus a margin; an inner Payment carries no fee of its own.
export const MAX_SETTLEMENT_FEE_DROPS = 1_000_000n;

export function assessSettlement(before: Snapshot, after: Snapshot, terms: Terms): SettlementVerdict {
  const shares = BigInt(terms.shares);
  const price = BigInt(terms.priceDrops);
  const dBuyerShares = BigInt(after.buyerShares) - BigInt(before.buyerShares);
  const dSellerShares = BigInt(after.sellerShares) - BigInt(before.sellerShares);
  const dBuyerXrp = BigInt(after.buyerXrp) - BigInt(before.buyerXrp);
  const dSellerXrp = BigInt(after.sellerXrp) - BigInt(before.sellerXrp);

  const sharesMoved = dBuyerShares === shares && dSellerShares === -shares;
  const sharesStill = dBuyerShares === 0n && dSellerShares === 0n;
  // The seller signs the outer Batch and pays its fee; the buyer's inner payment is exact.
  const sellerPaid = dSellerXrp >= price - MAX_SETTLEMENT_FEE_DROPS && dSellerXrp <= price;
  const buyerPaid = dBuyerXrp <= -price && dBuyerXrp >= -price - MAX_SETTLEMENT_FEE_DROPS;
  const paymentMoved = sellerPaid && buyerPaid;
  // Nothing moved except, at most, the outer fee charged to whoever signed it.
  const paymentStill = dBuyerXrp <= 0n && dBuyerXrp >= -MAX_SETTLEMENT_FEE_DROPS && dSellerXrp <= 0n && dSellerXrp >= -MAX_SETTLEMENT_FEE_DROPS;

  if (sharesMoved && paymentMoved) return { kind: "settled", buyerFeeDrops: (-dBuyerXrp - price).toString() };
  if (sharesStill && paymentStill) return { kind: "nothing-moved" };
  return {
    kind: "partial",
    detail: `shares Δ buyer ${dBuyerShares} / seller ${dSellerShares}; XRP Δ buyer ${dBuyerXrp} / seller ${dSellerXrp} drops`,
  };
}

export interface PreflightInput {
  offerState: string;
  expiresAt: string;
  sellerShares: string;
  buyerXrp: string;
  buyerHasHolder: boolean;
  buyerIsSeller: boolean;
  terms: Terms;
  now?: number;
}

export interface PreflightResult {
  ok: boolean;
  blockers: string[]; // conditions that stop settlement entirely
  needsAuthorize: boolean; // fixable by the buyer before settling
}

// 1 XRP of headroom over the price: the outer fee is not the buyer's, but reserves and fee floors
// on a test network are not worth a failed settlement over.
export const BUYER_HEADROOM_DROPS = 1_000_000n;

export function preflight(input: PreflightInput): PreflightResult {
  const blockers: string[] = [];
  const now = input.now ?? Date.now();
  if (input.buyerIsSeller) blockers.push("This is your own offer.");
  if (input.offerState !== "open") blockers.push(`Offer is ${input.offerState}, not open.`);
  else if (Date.parse(input.expiresAt) <= now) blockers.push("Offer has expired.");
  if (BigInt(input.sellerShares) < BigInt(input.terms.shares)) blockers.push("Seller no longer holds enough shares — cannot settle.");
  if (BigInt(input.buyerXrp) < BigInt(input.terms.priceDrops) + BUYER_HEADROOM_DROPS) blockers.push("Your XRP balance does not cover the price plus a 1 XRP margin.");
  return { ok: blockers.length === 0 && input.buyerHasHolder, blockers, needsAuthorize: !input.buyerHasHolder };
}

// Which pre-flight condition most plausibly changed between confirmation and validation.
export function likelyCause(before: Snapshot, terms: Terms): string {
  if (BigInt(before.sellerShares) < BigInt(terms.shares)) return "The seller moved shares before settlement validated.";
  if (BigInt(before.buyerXrp) < BigInt(terms.priceDrops) + BUYER_HEADROOM_DROPS) return "Your balance dropped below the price before settlement validated.";
  return "A leg became unfundable between confirmation and validation; the all-or-nothing rule cancelled both.";
}
