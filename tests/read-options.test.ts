import { expect, it } from 'vitest';
import { parseReadOptions } from '../src/read-options.js';

const vault = 'A'.repeat(64);
const account = 'rLNzsCg1LPnytzSdf4hLk7inC58BFzuX6J';
it('keeps share quantities exact and converts a quoted XRP price to drops', () => {
  const result = parseReadOptions(['position', '--vault', vault, '--account', account, '--shares', '9007199254740993', '--price', '0.000001']);
  expect(result).toMatchObject({ command: 'position', vaultId: vault, holder: account, offeredSharesRaw: '9007199254740993', askingPriceDrops: '1' });
});
it('requires both sides of a quote and rejects sub-drop prices', () => {
  expect(() => parseReadOptions(['position', '--vault', vault, '--account', account, '--shares', '1'])).toThrow(/together/);
  expect(() => parseReadOptions(['position', '--vault', vault, '--account', account, '--shares', '1', '--price', '0.0000001'])).toThrow(/six decimal/);
});
it('does not accept ambiguous or mistyped flags or an invalid holder', () => {
  expect(() => parseReadOptions(['position', '--vault', vault, '--account', 'not-an-account'])).toThrow(/account/);
  expect(() => parseReadOptions(['position', '--vault', vault, '--vault', vault, '--account', account])).toThrow(/Duplicate/);
  expect(() => parseReadOptions(['position', '--vault', vault, '--account', account, '--network', '1'])).toThrow(/Unknown/);
});
it('requires a broker when a loan is requested so associations can be checked', () => {
  expect(() => parseReadOptions(['position', '--vault', vault, '--account', account, '--loan', vault])).toThrow(/broker/);
});
it('normalizes hashes and accepts only bounded integer expiry ledgers', () => {
  expect(parseReadOptions(['transaction', '--hash', 'a'.repeat(64), '--last-ledger', '70000'])).toEqual({ command: 'transaction', hash: vault, lastLedgerSequence: 70000 });
  for (const value of ['1.5', '-1', 'NaN', '4294967296']) {
    expect(() => parseReadOptions(['transaction', '--hash', vault, '--last-ledger', value])).toThrow(/ledger/);
  }
});
it('rejects irrelevant flags and missing values before any network access', () => {
  expect(() => parseReadOptions(['transaction', '--hash', vault, '--price', '1'])).toThrow(/Unknown/);
  expect(() => parseReadOptions(['position', '--vault'])).toThrow(/value/);
  expect(() => parseReadOptions([])).toThrow(/Usage/);
});
