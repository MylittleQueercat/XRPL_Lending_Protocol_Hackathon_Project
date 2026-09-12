import { floorAccountingDrops, subtractAccountingDrops } from "@/lib/accounting";
// Pure arithmetic for the position screen. Everything takes drop or share-unit strings and stays
// in BigInt until a ratio is needed for display, so no monetary quantity is ever float-rounded.

export interface LiquidityPicture {
  totalDrops: string;
  availableDrops: string;
  deployedDrops: string;
  // 0..1 share of total assets currently out on loan.
  utilisation: number;
}

export function liquidityPicture(assetsTotalDrops: string, assetsAvailableDrops: string): LiquidityPicture {
  const total = BigInt(floorAccountingDrops(assetsTotalDrops || "0"));
  const available = BigInt(floorAccountingDrops(assetsAvailableDrops || "0"));
  const deployed = total >= available ? BigInt(floorAccountingDrops(subtractAccountingDrops(assetsTotalDrops || "0", assetsAvailableDrops || "0"))) : 0n;
  const utilisation = total === 0n ? 0 : Number((deployed * 10_000n) / total) / 10_000;
  return { totalDrops: total.toString(), availableDrops: available.toString(), deployedDrops: deployed.toString(), utilisation };
}

// Fraction of the vault the holding represents, 0..1.
export function shareOfVault(heldUnits: string, outstandingUnits: string): number {
  const held = BigInt(heldUnits || "0");
  const outstanding = BigInt(outstandingUnits || "0");
  if (outstanding === 0n) return 0;
  return Number((held * 10_000n) / outstanding) / 10_000;
}

// Whether a withdrawal request can be paid from available cash right now. This is a prediction the
// ledger will confirm or refute; the screen shows it as a hint, never as the outcome.
export function canVaultFund(requestedDrops: string, assetsAvailableDrops: string): boolean {
  return BigInt(requestedDrops || "0") <= BigInt(floorAccountingDrops(assetsAvailableDrops || "0"));
}

// The largest withdrawal the vault could pay today for this holder: min(accounting value, cash).
export function fundableTodayDrops(accountingValueDrops: string, assetsAvailableDrops: string): string {
  const value = BigInt(accountingValueDrops || "0");
  const cash = BigInt(floorAccountingDrops(assetsAvailableDrops || "0"));
  return (value < cash ? value : cash).toString();
}

// Distinguishes the two reasons a withdrawal can be refused. Only one of them is Raise's problem.
export type WithdrawalRefusal = "vault-liquidity" | "insufficient-shares" | "other";

export function classifyRefusal(resultCode: string, requestedDrops: string, accountingValueDrops: string, assetsAvailableDrops: string): WithdrawalRefusal {
  if (resultCode !== "tecINSUFFICIENT_FUNDS") return "other";
  const requested = BigInt(requestedDrops || "0");
  if (requested > BigInt(accountingValueDrops || "0")) return "insufficient-shares";
  if (requested > BigInt(floorAccountingDrops(assetsAvailableDrops || "0"))) return "vault-liquidity";
  return "other";
}
