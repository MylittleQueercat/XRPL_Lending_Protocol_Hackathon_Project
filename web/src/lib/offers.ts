// Offer model and lifecycle for the secondary market.
//
// This is the browser-side seam for issue #16, whose service implementation lives at the repo
// root (src/offers.ts, src/offer-store.ts, docs/OFFERS.md): a SQLite-backed offer service with the
// same draft/open/cancelled/expired/settling/settled lifecycle. Persistence here is a browser store
// so the screens can run without a server; wiring them to that service is the next step.
//
// Field mapping to the root model: `network` ↔ `networkId`, `shares` ↔ `sharesRaw`, price asset is
// implicitly XRP here (`priceAsset` there), and the root model adds an optimistic `revision`.
// One deliberate difference: this store allows `settling → open` when a settlement provably did not
// execute (nothing moved on the validated ledger), where the root service fails closed instead.
// Both are defensible; the buy screen documents which it relies on.
//
// Nothing here is a source of truth for ownership: the ledger is. Before any execution the buyer
// flow must re-read the seller's live share balance (see ledger.ts) and refuse stale offers.

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

const STORAGE_KEY = "raise.offers.v1";
const listeners = new Set<() => void>();

function read(): Offer[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Offer[]) : [];
  } catch {
    return [];
  }
}

function write(offers: Offer[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(offers));
  } catch {
    // Storage may be unavailable; the in-memory result is still returned to the caller.
  }
  for (const listener of listeners) listener();
}

export function subscribeOffers(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener();
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

// Expiry is evaluated on read so a stale record never presents itself as open.
export function withDerivedState(offer: Offer, now = Date.now()): Offer {
  if (offer.state === "open" && Date.parse(offer.expiresAt) <= now) return { ...offer, state: "expired" };
  return offer;
}

export function listOffers(): Offer[] {
  return read().map((o) => withDerivedState(o)).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export function getOffer(id: string): Offer | undefined {
  const offer = read().find((o) => o.id === id);
  return offer ? withDerivedState(offer) : undefined;
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

export function createOffer(input: Omit<Offer, "id" | "createdAt" | "state">): Offer {
  const offer: Offer = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString(), state: "open" };
  write([...read(), offer]);
  return offer;
}

export function transitionOffer(id: string, next: OfferState, settlement?: Offer["settlement"]): Offer | undefined {
  const offers = read();
  const index = offers.findIndex((o) => o.id === id);
  if (index < 0) return undefined;
  const current = withDerivedState(offers[index]);
  if (!canTransition(current.state, next)) throw new Error(`Cannot move an offer from ${current.state} to ${next}.`);
  const updated: Offer = { ...current, state: next, ...(settlement ? { settlement } : {}) };
  offers[index] = updated;
  write(offers);
  return updated;
}

// Allowed lifecycle moves. Anything else is a bug in the caller, not a user error.
const TRANSITIONS: Record<OfferState, OfferState[]> = {
  draft: ["open", "cancelled"],
  open: ["cancelled", "expired", "settling"],
  settling: ["settled", "open"], // back to open only when settlement provably did not execute
  settled: [],
  cancelled: [],
  expired: [],
};

export function canTransition(from: OfferState, to: OfferState): boolean {
  return TRANSITIONS[from].includes(to);
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
