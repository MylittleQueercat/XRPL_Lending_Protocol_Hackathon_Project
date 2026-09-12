import { expect, it } from 'vitest';
import * as valuation from '../src/valuation.js';

it.each([['1.23e5','123000','123000'],['1000.25','1000','1001'],['9e-7','0','1'],['9007199254740993.1','9007199254740993','9007199254740994'],['0','0','0']])('normalizes %s without floating point', (value,floor,ceil) => {
  expect(valuation.floorAccountingDrops(value!)).toBe(floor);
  expect(valuation.ceilAccountingDrops(value!)).toBe(ceil);
});
it('subtracts decimal accounting values before any rounding', () => {
  expect(valuation.subtractAccountingDrops('1.5','7.5e-1')).toBe('0.75');
  expect(valuation.subtractAccountingDrops('1000.25','200.5')).toBe('799.75');
});
it('rejects negative and unbounded values', () => {
  expect(() => valuation.floorAccountingDrops('-1')).toThrow();
  expect(() => valuation.ceilAccountingDrops('1e99999')).toThrow();
  expect(() => valuation.subtractAccountingDrops('1','2')).toThrow();
});
