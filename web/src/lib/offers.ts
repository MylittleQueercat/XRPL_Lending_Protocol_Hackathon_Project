export type OfferState = "draft" | "open" | "cancelled" | "expired" | "settling" | "settled";

export interface Offer {
  id: string;
  network: number;
  vaultId: string;
  shareMptId: string;
  seller: string;
  shares: string; // share units, integer string
  priceDrops: string; // total price in drops
  createdAt: string; // ISO
  expiresAt: string; // ISO
  state: OfferState;
  // Settlement outcome, present once settling/settled.
  settlement?: { hash: string; ledgerIndex: number; buyer: string };
}

// Display model only. Server persistence and lifecycle are accessed through market-client.ts.
export function withDerivedState(offer: Offer, now = Date.now()): Offer {
  if (offer.state === "open" && Date.parse(offer.expiresAt) <= now) return { ...offer, state: "expired" };
  return offer;
}

export function validateOfferInput(input: Pick<Offer, "network" | "vaultId" | "shareMptId" | "seller" | "shares" | "priceDrops" | "expiresAt">, expectedNetwork: number): string[] {
  const errors: string[] = [];
  if (input.network !== expectedNetwork) errors.push(`Offer is for network ${input.network}, not ${expectedNetwork}.`);
  if (!/^[A-F0-9]{64}$/i.test(input.vaultId)) errors.push("Vault ID must be a 64-character hex ledger index.");
  if (!/^[A-F0-9]{48}$/i.test(input.shareMptId)) errors.push("Share MPT issuance ID must be a 48-character hex string.");
  if (!/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(input.seller)) errors.push("Seller must be a classic XRPL address.");
  if (!/^[1-9]\d*$/.test(input.shares)) errors.push("Shares must be a positive integer.");
  if (!/^[1-9]\d*$/.test(input.priceDrops)) errors.push("Price must be a positive amount.");
  if (Number.isNaN(Date.parse(input.expiresAt)) || Date.parse(input.expiresAt) <= Date.now()) errors.push("Expiry must be in the future.");
  return errors;
}

export function canTransition(from: OfferState, to: OfferState): boolean {
  const transitions: Record<OfferState, OfferState[]> = {
    draft: ["open", "cancelled"], open: ["cancelled", "expired", "settling"],
    settling: ["settled"], settled: [], cancelled: [], expired: [],
  };
  return transitions[from].includes(to);
}

// Unit price in drops per share, exact rational shown as a decimal string.
export function unitPriceDrops(offer: Pick<Offer, "priceDrops" | "shares">): string {
  const price = BigInt(offer.priceDrops);
  const shares = BigInt(offer.shares);
  if (shares === 0n) return "0";
  const scaled = (price * 1_000_000n) / shares;
  const whole = scaled / 1_000_000n;
  const frac = (scaled % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

// Discount of the asked price against the position's accounting value. Positive = discount.
// Both inputs in drops; returns a ratio, not a percentage.
export function discountRatio(priceDrops: string, accountingValueDrops: string): number | null {
  const value = Number(accountingValueDrops);
  if (!value) return null;
  return (value - Number(priceDrops)) / value;
}
