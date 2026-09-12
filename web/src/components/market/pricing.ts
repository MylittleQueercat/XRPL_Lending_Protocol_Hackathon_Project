// Pure pricing helpers for the market screens. No ledger access here so they are unit-testable.
import { discountRatio, unitPriceDrops, type Offer, type OfferState } from "@/lib/offers";
import type { VaultState } from "@/lib/ledger";
import { formatPercent } from "@/lib/format";

export type VsValueKind = "discount" | "premium" | "par" | "unknown";

export interface VsValue {
  kind: VsValueKind;
  ratio: number | null; // positive = below accounting value
  label: string; // e.g. "−5.0 %", "+3.2 %", "at value", "—"
}

// A price below accounting value is a discount to the position's book value. It is not yield: the
// buyer's return still depends on the vault's loans and on liquidity being there when they exit.
export function describeVsValue(priceDrops: string, accountingValueDrops: string | null | undefined): VsValue {
  if (!accountingValueDrops) return { kind: "unknown", ratio: null, label: "—" };
  const ratio = discountRatio(priceDrops, accountingValueDrops);
  if (ratio === null) return { kind: "unknown", ratio: null, label: "—" };
  if (Math.abs(ratio) < 0.00005) return { kind: "par", ratio, label: "at value" };
  if (ratio > 0) return { kind: "discount", ratio, label: `−${formatPercent(ratio)}` };
  return { kind: "premium", ratio, label: `+${formatPercent(-ratio)}` };
}

// Share of vault assets currently out on loan. 0 when the vault is empty.
export function utilisationRatio(vault: Pick<VaultState, "assetsTotalDrops" | "assetsAvailableDrops">): number {
  const total = Number(vault.assetsTotalDrops);
  if (!total) return 0;
  const deployed = total - Number(vault.assetsAvailableDrops);
  return Math.min(1, Math.max(0, deployed / total));
}

export function unitPriceLabel(offer: Pick<Offer, "priceDrops" | "shares">): string {
  return `${unitPriceDrops(offer)} drops / share`;
}

// Whether the seller's live holding can still cover the listed quantity. null while unknown.
export function sellerCanDeliver(sellerBalance: string | null | undefined, shares: string): boolean | null {
  if (sellerBalance === null || sellerBalance === undefined) return null;
  return BigInt(sellerBalance) >= BigInt(shares);
}

export type MarketFilter = "open" | "settled" | "all";

export function filterOffers(offers: Offer[], filter: MarketFilter): Offer[] {
  if (filter === "all") return offers;
  if (filter === "settled") return offers.filter((o) => o.state === "settled");
  return offers.filter((o) => o.state === "open");
}

export const STATE_TONE: Record<OfferState, "default" | "secondary" | "success" | "warning" | "destructive" | "outline"> = {
  open: "success",
  settling: "warning",
  settled: "secondary",
  draft: "outline",
  cancelled: "destructive",
  expired: "outline",
};

// Whether the connected viewer may proceed to buy, and if not, the single reason shown to them.
export function isBuyable(offer: Offer, sellerCovers: boolean | null, viewer: string | null): { ok: boolean; reason: string | null } {
  if (viewer && viewer === offer.seller) return { ok: false, reason: "This is your offer" };
  if (offer.state !== "open") return { ok: false, reason: offer.state === "expired" ? "This offer has expired" : `Offer is ${offer.state}` };
  if (Date.parse(offer.expiresAt) <= Date.now()) return { ok: false, reason: "This offer has expired" };
  if (sellerCovers === false) return { ok: false, reason: "Seller no longer holds enough shares" };
  if (sellerCovers === null) return { ok: false, reason: "Checking the seller's live balance" };
  return { ok: true, reason: null };
}
