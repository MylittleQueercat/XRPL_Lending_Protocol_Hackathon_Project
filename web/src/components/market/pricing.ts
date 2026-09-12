import { liquidityPicture } from "@/components/position/position-math";
// Pure pricing helpers for the market screens. No ledger access here so they are unit-testable.
import { discountRatio, unitPriceDrops, type Offer, type OfferState } from "@/lib/offers";
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

// ---------------------------------------------------------------------------------------------
// Market Watch figures. Pure so the KPI strip can be unit-tested without a ledger.
// ---------------------------------------------------------------------------------------------

export interface MarketSummary {
  open: number; // offers currently open
  listedDrops: string; // sum of open offers' asked prices, in drops
  medianDiscount: number | null; // median discount ratio of open offers with a known accounting value
  priced: number; // open offers whose accounting value was available
  vaults: number; // distinct vaults with an open offer
}

export function summarizeMarket(offers: Offer[], accountingValueOf: (offer: Offer) => string | null | undefined): MarketSummary {
  const open = offers.filter((o) => o.state === "open");
  let listed = 0n;
  const ratios: number[] = [];
  const vaults = new Set<string>();
  for (const offer of open) {
    listed += BigInt(offer.priceDrops);
    vaults.add(offer.vaultId);
    const value = accountingValueOf(offer);
    if (!value) continue;
    const ratio = discountRatio(offer.priceDrops, value);
    if (ratio !== null && Number.isFinite(ratio)) ratios.push(ratio);
  }
  ratios.sort((a, b) => a - b);
  const mid = ratios.length >> 1;
  const medianDiscount = ratios.length === 0 ? null : ratios.length % 2 ? ratios[mid] : (ratios[mid - 1] + ratios[mid]) / 2;
  return { open: open.length, listedDrops: listed.toString(), medianDiscount, priced: ratios.length, vaults: vaults.size };
}

// "2d 04h", "3h 12m", "4m 09s", "expired". Terminal style: two fields, no words.
export function formatCountdown(msRemaining: number): string {
  if (!Number.isFinite(msRemaining) || msRemaining <= 0) return "expired";
  const s = Math.floor(msRemaining / 1000);
  const d = Math.floor(s / 86_400), h = Math.floor((s % 86_400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const two = (n: number) => n.toString().padStart(2, "0");
  if (d > 0) return `${d}d ${two(h)}h`;
  if (h > 0) return `${h}h ${two(m)}m`;
  return `${m}m ${two(sec)}s`;
}

// Drops per raw share unit, for display only. NAV per share is a float from the history module;
// money that is paid or signed is never formatted through here.
export function formatDropsPerShare(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}
