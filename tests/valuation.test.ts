import { describe, expect, it } from 'vitest';
import { valuePosition, type PositionValuationInput } from '../src/valuation.js';

const vault: PositionValuationInput = {
  assetsTotalDrops: '1200000000', assetsAvailableDrops: '100000000',
  lossUnrealizedDrops: '200000000', totalSharesRaw: '1000000000',
  heldSharesRaw: '250000000', shareScale: 0,
};

describe('vault-share valuation', () => {
  it('separates loss-adjusted accounting value, available cash and secondary asking price', () => {
    const result = valuePosition({ ...vault, offeredSharesRaw: '100000000', askingPriceDrops: '90000000' });
    expect(result.netAssetValueDrops).toBe('1000000000');
    expect(result.accountingClaimDrops).toBe('250000000');
    expect(result.liquidityLimitedWithdrawalEstimateDrops).toBe('100000000');
    expect(result.offeredAccountingClaimDrops).toBe('100000000');
    expect(result.askingDiscountBps).toBe('1000');
    expect(result.estimateOnly).toBe(true);
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it('changes displayed units but never accounting valuation with nonzero share scale', () => {
    const scaled = valuePosition({ ...vault, shareScale: 6 });
    expect(scaled.heldSharesDisplay).toBe('250');
    expect(scaled.totalSharesDisplay).toBe('1000');
    expect(scaled.accountingClaimDrops).toBe(valuePosition(vault).accountingClaimDrops);
    expect(valuePosition({ ...vault, heldSharesRaw: '1', shareScale: 18 }).heldSharesDisplay).toBe('0.000000000000000001');
    expect(valuePosition(vault).heldSharesDisplay).toBe('250000000');
  });

  it('floors sub-drop claims and retains fractional vault accounting quantities', () => {
    const result = valuePosition({ ...vault, assetsTotalDrops: '1.9', lossUnrealizedDrops: '0.1', assetsAvailableDrops: '1.8', totalSharesRaw: '3', heldSharesRaw: '1', offeredSharesRaw: '1', askingPriceDrops: '1' });
    expect(result.netAssetValueDrops).toBe('1.8');
    expect(result.accountingClaimDrops).toBe('0');
    expect(result.liquidityLimitedWithdrawalEstimateDrops).toBe('0');
    // A 1-drop ask versus an exact 0.6-drop claim is a premium, not undefined.
    expect(result.askingDiscountBps).toBe('-6666');
  });

  it('preserves one-drop boundaries above Number.MAX_SAFE_INTEGER', () => {
    const result = valuePosition({ ...vault, assetsTotalDrops: '18014398509481986', lossUnrealizedDrops: '0', assetsAvailableDrops: '18014398509481986', totalSharesRaw: '2', heldSharesRaw: '1' });
    expect(result.accountingClaimDrops).toBe('9007199254740993');
  });

  it('keeps accounting NAV loss-adjusted while applying the documented sole-holder withdrawal exception', () => {
    const result = valuePosition({ ...vault, assetsAvailableDrops: '1200000000', heldSharesRaw: vault.totalSharesRaw });
    expect(result.accountingClaimDrops).toBe('1000000000');
    expect(result.withdrawalValueEstimateDrops).toBe('1200000000');
    expect(result.liquidityLimitedWithdrawalEstimateDrops).toBe('1200000000');
    expect(result.soleHolderLossWaiverApplied).toBe(true);
    expect(valuePosition(vault).soleHolderLossWaiverApplied).toBe(false);
  });

  it('returns zero for an empty vault and an absent position without dividing by zero', () => {
    const result = valuePosition({ ...vault, assetsTotalDrops: '0', assetsAvailableDrops: '0', lossUnrealizedDrops: '0', totalSharesRaw: '0', heldSharesRaw: '0' });
    expect(result.accountingClaimDrops).toBe('0');
    expect(result.askingDiscountBps).toBeNull();
    expect(result.offeredAccountingClaimDrops).toBeNull();
    expect(result.soleHolderLossWaiverApplied).toBe(false);
    expect(valuePosition({ ...vault, heldSharesRaw: '0' }).accountingClaimDrops).toBe('0');
  });

  it('does not invent a discount when NAV is zero', () => {
    const result = valuePosition({ ...vault, lossUnrealizedDrops: vault.assetsTotalDrops, offeredSharesRaw: '1', askingPriceDrops: '1' });
    expect(result.accountingClaimDrops).toBe('0');
    expect(result.askingDiscountBps).toBeNull();
  });

  it('calculates discounts against exact offer value before rounding', () => {
    const result = valuePosition({ ...vault, assetsTotalDrops: '10', assetsAvailableDrops: '0', lossUnrealizedDrops: '0', totalSharesRaw: '3', heldSharesRaw: '1', offeredSharesRaw: '1', askingPriceDrops: '3' });
    expect(result.offeredAccountingClaimDrops).toBe('3');
    expect(result.askingDiscountBps).toBe('1000');
  });

  it('floors fractional liquid drops and supports tiny exact loss values', () => {
    const result = valuePosition({ ...vault, assetsAvailableDrops: '1.999', lossUnrealizedDrops: '0.0000000000000000001' });
    expect(result.netAssetValueDrops).toBe('1199999999.9999999999999999999');
    expect(result.accountingClaimDrops).toBe('299999999');
    expect(result.liquidityLimitedWithdrawalEstimateDrops).toBe('1');
  });


  it('reads positive and negative scientific NUMBER exports without floating-point conversion', () => {
    const result = valuePosition({ ...vault, assetsTotalDrops: '1e11', assetsAvailableDrops: '1e-11', lossUnrealizedDrops: '1e-11' });
    expect(result.netAssetValueDrops).toBe('99999999999.99999999999');
    expect(result.accountingClaimDrops).toBe('24999999999');
    expect(result.liquidityLimitedWithdrawalEstimateDrops).toBe('0');
  });

  it('keeps NAV, loss, liquidity and asking discounts equivalent across scientific formats', () => {
    const offer = { offeredSharesRaw: '100000000', askingPriceDrops: '90000000' };
    const scientific = valuePosition({ ...vault, ...offer, assetsTotalDrops: '1.2E+9', assetsAvailableDrops: '10000000000e-2', lossUnrealizedDrops: '0.2e9' });
    expect(scientific).toEqual(valuePosition({ ...vault, ...offer }));
    const empty = valuePosition({ ...vault, assetsTotalDrops: '0e32768', assetsAvailableDrops: '0E-32768', lossUnrealizedDrops: '0e+0', totalSharesRaw: '0', heldSharesRaw: '0' });
    expect(empty.netAssetValueDrops).toBe('0');
  });

  it('preserves a scientific mantissa above the safe-number integer range', () => {
    const result = valuePosition({ ...vault, assetsTotalDrops: '18014398509481986e1', assetsAvailableDrops: '0', lossUnrealizedDrops: '0', totalSharesRaw: '2', heldSharesRaw: '1' });
    expect(result.accountingClaimDrops).toBe('90071992547409930');
  });

  it('supports the bounded NUMBER exponent edges', () => {
    const positive = valuePosition({ ...vault, assetsTotalDrops: '1e32768', assetsAvailableDrops: '0', lossUnrealizedDrops: '0' });
    expect(positive.netAssetValueDrops).toBe(`1${'0'.repeat(32768)}`);
    const negative = valuePosition({ ...vault, assetsTotalDrops: '1e-32768', assetsAvailableDrops: '0', lossUnrealizedDrops: '0' });
    expect(negative.netAssetValueDrops).toBe(`0.${'0'.repeat(32767)}1`);
    expect(negative.accountingClaimDrops).toBe('0');
  });

  it.each(['1e32769', '1e-32769', '1e99999999999999999999', `1e${'0'.repeat(256)}`, '9'.repeat(257)])('rejects unbounded scientific inputs before allocating large powers: %s', (amount) => {
    expect(() => valuePosition({ ...vault, assetsTotalDrops: amount })).toThrow(/assetsTotalDrops/);
  });

  it.each(['-1', '1e', '1e1.5', '1e+-1', ' 1', '01', '', 'NaN', '1.', '.1', '+1'])('rejects malformed accounting amounts: %s', (amount) => {
    expect(() => valuePosition({ ...vault, assetsTotalDrops: amount })).toThrow(/assetsTotalDrops/);
  });
  it('rejects runtime numeric inputs instead of silently losing precision', () => {
    expect(() => valuePosition({ ...vault, assetsTotalDrops: Number.MAX_SAFE_INTEGER + 1 as unknown as string })).toThrow(/assetsTotalDrops/);
  });
  it.each([-1, 19, 0.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid scale %s', (shareScale) => {
    expect(() => valuePosition({ ...vault, shareScale })).toThrow(/shareScale/);
  });
  it('rejects an asking payment larger than the XRP supply limit', () => {
    expect(() => valuePosition({ ...vault, offeredSharesRaw: '1', askingPriceDrops: '100000000000000001' })).toThrow(/askingPriceDrops/);
  });
  it('accepts exact maximum MPT supply without losing units', () => {
    const result = valuePosition({ ...vault, totalSharesRaw: '9223372036854775807', heldSharesRaw: '9223372036854775807' });
    expect(result.heldSharesDisplay).toBe('9223372036854775807');
  });
  it.each([
    { heldSharesRaw: '1000000001' }, { totalSharesRaw: '0' },
    { totalSharesRaw: '9223372036854775808' }, { heldSharesRaw: '0.1' },
    { lossUnrealizedDrops: '1200000001' }, { assetsAvailableDrops: '1200000001' },
    { offeredSharesRaw: '0', askingPriceDrops: '1' },
    { offeredSharesRaw: '250000001', askingPriceDrops: '1' },
    { offeredSharesRaw: '1' }, { askingPriceDrops: '1' },
    { offeredSharesRaw: '1', askingPriceDrops: '0' },
    { offeredSharesRaw: '1', askingPriceDrops: '0.5' },
  ])('rejects inconsistent or unrepresentable inputs: %j', (invalid) => {
    expect(() => valuePosition({ ...vault, ...invalid })).toThrow();
  });
});
