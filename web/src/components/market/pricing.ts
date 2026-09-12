import { liquidityPicture } from "@/components/position/position-math";
// Pure pricing helpers for the market screens. No ledger access here so they are unit-testable.
import { unitPriceDrops, type Offer, type OfferState } from "@/lib/offers";
import type { VaultState } from "@/lib/ledger";

export { describeVsValue, type VsValue, type VsValueKind } from "@/lib/pricing";

// Share of vault assets currently out on loan. 0 when the vault is empty.
export function utilisationRatio(vault: Pick<VaultState, "assetsTotalDrops" | "assetsAvailableDrops">): number {
  return liquidityPicture(vault.assetsTotalDrops, vault.assetsAvailableDrops).utilisation;
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
