// Pure arithmetic for the portfolio terminal. Every monetary quantity stays a drop string or a
// BigInt until display; ratios are the only floats and they only feed colours and percentages.
import { valuePosition } from "@/lib/accounting";
import { shareValueDrops, type ShareHolding, type VaultState } from "@/lib/ledger";
import { navPerShare, utilisationOf } from "@/lib/history";
import { fundableTodayDrops } from "@/components/position/position-math";

export interface Position {
  vault: VaultState;
  heldUnits: string; // raw share units, "0" when the wallet holds none
  accountingValueDrops: string; // whole drops, floor
  withdrawalValueEstimateDrops: string; // whole drops; equals accounting value unless the sole-holder waiver applies
  withdrawableTodayDrops: string; // min(withdrawal estimate, vault cash), whole drops
  soleHolderLossWaiverApplied: boolean;
  navPerShare: number; // drops per raw share unit
  utilisation: number; // 0..1
}

// Values a holding against its vault. The exact rule (docs/READ_MODEL.md) can throw on an
// inconsistent pair of reads (for example a holding read after a redemption changed the supply);
// then the position falls back to the plain integer claim so the screen still renders.
export function buildPosition(vault: VaultState, heldUnits: string): Position {
  const nav = navPerShare(vault.assetsTotalDrops, vault.lossUnrealizedDrops ?? "0", vault.sharesOutstanding);
  const utilisation = utilisationOf(vault.assetsTotalDrops, vault.assetsAvailableDrops);
  try {
    const valuation = valuePosition({
      assetsTotalDrops: vault.assetsTotalDrops,
      assetsAvailableDrops: vault.assetsAvailableDrops,
      lossUnrealizedDrops: vault.lossUnrealizedDrops ?? "0",
      totalSharesRaw: vault.sharesOutstanding,
      heldSharesRaw: heldUnits,
      shareScale: 0,
    });
    return {
      vault,
      heldUnits,
      accountingValueDrops: valuation.accountingClaimDrops,
      withdrawalValueEstimateDrops: valuation.withdrawalValueEstimateDrops,
      withdrawableTodayDrops: valuation.liquidityLimitedWithdrawalEstimateDrops,
      soleHolderLossWaiverApplied: valuation.soleHolderLossWaiverApplied,
      navPerShare: nav,
      utilisation,
    };
  } catch {
    let accountingValueDrops = "0";
    try { accountingValueDrops = shareValueDrops(heldUnits, vault); } catch { /* keep zero */ }
    return {
      vault,
      heldUnits,
      accountingValueDrops,
      withdrawalValueEstimateDrops: accountingValueDrops,
      withdrawableTodayDrops: fundableTodayDrops(accountingValueDrops, vault.assetsAvailableDrops),
      soleHolderLossWaiverApplied: false,
      navPerShare: nav,
      utilisation,
    };
  }
}

export function heldUnitsFor(vault: VaultState, holdings: ShareHolding[]): string {
  return holdings.find((h) => h.shareMptId === vault.shareMptId)?.amount ?? "0";
}

// Holdings whose issuance matches none of the vaults we know. The ledger has no MPT-to-vault
// index, so the only way to map them is for the user to paste the vault id.
export function unmappedHoldings(holdings: ShareHolding[], vaults: VaultState[]): ShareHolding[] {
  const known = new Set(vaults.map((v) => v.shareMptId));
  return holdings.filter((h) => !known.has(h.shareMptId) && BigInt(h.amount || "0") > 0n);
}

export interface AccountTotals {
  positionsValueDrops: string;
  withdrawableTodayDrops: string;
  equityDrops: string | null; // null while the wallet balance is unknown
}

export function accountTotals(positions: Position[], balanceDrops: string | null): AccountTotals {
  let value = 0n;
  let withdrawable = 0n;
  for (const p of positions) {
    if (BigInt(p.heldUnits || "0") === 0n) continue;
    value += BigInt(p.accountingValueDrops || "0");
    withdrawable += BigInt(p.withdrawableTodayDrops || "0");
  }
  return {
    positionsValueDrops: value.toString(),
    withdrawableTodayDrops: withdrawable.toString(),
    equityDrops: balanceDrops === null ? null : (BigInt(balanceDrops) + value).toString(),
  };
}

// Relative change of NAV per share between two samples; null when there is no meaningful base.
export function navChangeRatio(first: number | null | undefined, last: number | null | undefined): number | null {
  if (!first || !Number.isFinite(first) || last === null || last === undefined || !Number.isFinite(last)) return null;
  return (last - first) / first;
}

// A share of a drop amount, floored, as a plain XRP decimal the amount input accepts
// (no thousands separators, no unit).
export function fractionOfDropsAsXrpInput(drops: string | null, percent: number): string {
  if (!drops) return "";
  const share = (BigInt(drops) * BigInt(percent)) / 100n;
  if (share <= 0n) return "";
  const whole = share / 1_000_000n;
  const frac = (share % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

// NAV per share is drops per raw unit; on an XRP vault it starts at 1 and moves with realised
// interest and losses, so six decimals is the resolution that shows a change at all.
export function formatNav(nav: number | null | undefined): string {
  if (nav === null || nav === undefined || !Number.isFinite(nav)) return "—";
  return nav.toFixed(6);
}
