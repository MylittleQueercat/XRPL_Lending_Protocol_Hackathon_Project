// Price against accounting value, described once for every screen.
//
// A price below accounting value is a discount to the position's book value. It is not yield: the
// buyer's return still depends on the vault's loans and on liquidity being there when they exit.
// Every screen that shows the comparison goes through here so the wording and the tone match.
import { discountRatio } from "./offers";
import { formatPercent } from "./format";

export type VsValueKind = "discount" | "premium" | "par" | "unknown";

export interface VsValue {
  kind: VsValueKind;
  ratio: number | null; // positive = below accounting value
  label: string; // compact: "−5.0 %", "+3.2 %", "at value", "—"
}

const PAR_EPSILON = 0.00005;

export function describeRatio(ratio: number | null): VsValue {
  if (ratio === null || Number.isNaN(ratio)) return { kind: "unknown", ratio: null, label: "—" };
  if (Math.abs(ratio) < PAR_EPSILON) return { kind: "par", ratio, label: "at value" };
  if (ratio > 0) return { kind: "discount", ratio, label: `−${formatPercent(ratio)}` };
  return { kind: "premium", ratio, label: `+${formatPercent(-ratio)}` };
}

export function describeVsValue(priceDrops: string, accountingValueDrops: string | null | undefined): VsValue {
  if (!accountingValueDrops) return describeRatio(null);
  return describeRatio(discountRatio(priceDrops, accountingValueDrops));
}

// Longer wording for review and confirmation steps, where the badge stands alone.
export function verboseLabel(value: VsValue): string {
  switch (value.kind) {
    case "discount": return `${formatPercent(value.ratio ?? 0, 2)} discount to accounting value`;
    case "premium": return `${formatPercent(-(value.ratio ?? 0), 2)} premium over accounting value`;
    case "par": return "At accounting value";
    default: return "No accounting value to compare";
  }
}

export const VS_VALUE_TITLE: Record<VsValueKind, string> = {
  discount: "Asked price is below the position's accounting value. A discount is not yield.",
  premium: "Asked price is above the position's accounting value.",
  par: "Asked price equals the position's accounting value.",
  unknown: "Accounting value unavailable.",
};
