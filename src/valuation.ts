export interface PositionValuationInput {
  /** Nonnegative decimal/scientific drops; accounting NUMBER fields may contain sub-drops. */
  assetsTotalDrops: string;
  assetsAvailableDrops: string;
  lossUnrealizedDrops: string;
  totalSharesRaw: string;
  heldSharesRaw: string;
  /** MPTokenIssuance.AssetScale; XRP vault shares use 0. Display only. */
  shareScale: number;
  offeredSharesRaw?: string;
  /** Positive whole drops, supplied with offeredSharesRaw. */
  askingPriceDrops?: string;
}

export interface PositionValuation {
  netAssetValueDrops: string;
  accountingClaimDrops: string;
  withdrawalValueEstimateDrops: string;
  liquidityLimitedWithdrawalEstimateDrops: string;
  totalSharesDisplay: string;
  heldSharesDisplay: string;
  offeredAccountingClaimDrops: string | null;
  /** Positive = discount, negative = premium. Truncated toward zero. */
  askingDiscountBps: string | null;
  soleHolderLossWaiverApplied: boolean;
  rounding: 'floor';
  estimateOnly: true;
}

interface Decimal {
  units: bigint;
  places: number;
}

const MAX_RAW_SHARES = (1n << 63n) - 1n;
const MAX_XRP_PAYMENT_DROPS = 100_000_000_000_000_000n;
// Bound both input size and power allocation. NUMBER uses exponents from -32768 to 32768.
// https://github.com/XRPLF/rippled/blob/develop/include/xrpl/basics/Number.h
const MAX_AMOUNT_LENGTH = 256;
const MAX_ACCOUNTING_EXPONENT = 32768;

function decimalAmount(value: string, field: string): Decimal {
  if (typeof value !== 'string' || value.length > MAX_AMOUNT_LENGTH) {
    throw new Error(`${field} must be a bounded nonnegative decimal or scientific string`);
  }
  const match = /^(0|[1-9]\d*)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(value);
  if (!match) throw new Error(`${field} must be a nonnegative decimal or scientific string`);
  const [, whole = '0', fraction = '', exponentText = '0'] = match;
  // Only the bounded exponent becomes a JS number. Monetary digits never do.
  const exponent = Number(exponentText);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > MAX_ACCOUNTING_EXPONENT) {
    throw new Error(`${field} exponent must be between -32768 and 32768`);
  }
  const units = BigInt(whole + fraction);
  if (units === 0n) return { units: 0n, places: 0 };
  const places = fraction.length - exponent;
  return places < 0 ? { units: units * 10n ** BigInt(-places), places: 0 } : { units, places };
}

function integerAmount(value: string, field: string): bigint {
  if (typeof value !== 'string' || value.length > MAX_AMOUNT_LENGTH || !/^(0|[1-9]\d*)$/.test(value)) {
    throw new Error(`${field} must be a nonnegative whole-number string`);
  }
  return BigInt(value);
}

function rawShares(value: string, field: string): bigint {
  const amount = integerAmount(value, field);
  if (amount > MAX_RAW_SHARES) throw new Error(`${field} exceeds the MPT uint63 limit`);
  return amount;
}

function decimalDisplay(units: bigint, places: number): string {
  if (places === 0) return units.toString();
  const digits = units.toString().padStart(places + 1, '0');
  const fraction = digits.slice(-places).replace(/0+$/, '');
  return `${digits.slice(0, -places)}${fraction ? `.${fraction}` : ''}`;
}

function validateBalances(total: bigint, available: bigint, loss: bigint, supply: bigint, held: bigint): void {
  if (available > total) throw new Error('assetsAvailableDrops exceeds assetsTotalDrops');
  if (loss > total) throw new Error('lossUnrealizedDrops exceeds assetsTotalDrops');
  if (held > supply) throw new Error('heldSharesRaw exceeds totalSharesRaw');
  if (supply === 0n && total !== 0n) throw new Error('Nonzero assetsTotalDrops with zero totalSharesRaw');
}

function valueOffer(input: PositionValuationInput, held: bigint, supply: bigint, netAssets: bigint, precision: bigint) {
  if (input.offeredSharesRaw === undefined && input.askingPriceDrops === undefined) {
    return { offeredAccountingClaimDrops: null, askingDiscountBps: null };
  }
  if (input.offeredSharesRaw === undefined || input.askingPriceDrops === undefined) {
    throw new Error('offeredSharesRaw and askingPriceDrops must be supplied together');
  }
  const offered = rawShares(input.offeredSharesRaw, 'offeredSharesRaw');
  const askingPrice = integerAmount(input.askingPriceDrops, 'askingPriceDrops');
  if (offered === 0n || offered > held) throw new Error('offeredSharesRaw must be positive and at most heldSharesRaw');
  if (askingPrice === 0n || askingPrice > MAX_XRP_PAYMENT_DROPS) {
    throw new Error('askingPriceDrops must be positive and within the XRP supply limit');
  }
  const claimNumerator = offered * netAssets;
  // Compare to the exact rational claim before flooring, so dust does not distort the discount.
  const discountBps = claimNumerator === 0n ? null
    : ((claimNumerator - askingPrice * supply * precision) * 10000n / claimNumerator).toString();
  return {
    offeredAccountingClaimDrops: (claimNumerator / (supply * precision)).toString(),
    askingDiscountBps: discountBps,
  };
}

/**
 * Read-only accounting estimates, not a transaction quote or guaranteed yield.
 * XLS-65 §§3.1.6–3.1.7: shares use raw OutstandingAmount; net NAV deducts LossUnrealized.
 * §3.6 waives that deduction for withdrawals by the sole outstanding shareholder.
 * https://github.com/XRPLF/XRPL-Standards/blob/master/XLS-0065-single-asset-vault/README.md
 *
 * The liquidity cap ignores execution rounding, phase restrictions, locks, authorization,
 * transaction fees and later ledger changes. A full-position redemption can fail rather
 * than partially fill; these amounts are not instructions for VaultWithdraw.
 */
export function valuePosition(input: PositionValuationInput): PositionValuation {
  if (!Number.isInteger(input.shareScale) || input.shareScale < 0 || input.shareScale > 18) {
    throw new Error('shareScale must be an integer from 0 through 18');
  }
  const total = decimalAmount(input.assetsTotalDrops, 'assetsTotalDrops');
  const available = decimalAmount(input.assetsAvailableDrops, 'assetsAvailableDrops');
  const loss = decimalAmount(input.lossUnrealizedDrops, 'lossUnrealizedDrops');
  const places = Math.max(total.places, available.places, loss.places);
  const precision = 10n ** BigInt(places);
  const align = (amount: Decimal) => amount.units * 10n ** BigInt(places - amount.places);
  const assetsTotal = align(total);
  const assetsAvailable = align(available);
  const lossUnrealized = align(loss);
  const supply = rawShares(input.totalSharesRaw, 'totalSharesRaw');
  const held = rawShares(input.heldSharesRaw, 'heldSharesRaw');
  validateBalances(assetsTotal, assetsAvailable, lossUnrealized, supply, held);
  const netAssets = assetsTotal - lossUnrealized;
  const accountingClaim = supply === 0n ? 0n : held * netAssets / (supply * precision);
  const soleHolderLossWaiverApplied = held > 0n && held === supply && lossUnrealized > 0n;
  const withdrawalValue = soleHolderLossWaiverApplied ? assetsTotal / precision : accountingClaim;
  const liquidDrops = assetsAvailable / precision;

  return {
    netAssetValueDrops: decimalDisplay(netAssets, places),
    accountingClaimDrops: accountingClaim.toString(),
    withdrawalValueEstimateDrops: withdrawalValue.toString(),
    liquidityLimitedWithdrawalEstimateDrops: (withdrawalValue < liquidDrops ? withdrawalValue : liquidDrops).toString(),
    totalSharesDisplay: decimalDisplay(supply, input.shareScale),
    heldSharesDisplay: decimalDisplay(held, input.shareScale),
    ...valueOffer(input, held, supply, netAssets, precision),
    soleHolderLossWaiverApplied,
    rounding: 'floor',
    estimateOnly: true,
  };
}
