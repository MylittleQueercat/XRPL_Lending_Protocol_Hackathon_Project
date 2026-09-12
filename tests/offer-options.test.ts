import { describe, expect, it } from 'vitest';
import { parseOfferOptions } from '../src/offer-options.js';

describe('offer CLI options', () => {
  it('defaults to the ignored local database and lists discoverable offers', () => {
    expect(parseOfferOptions(['list'])).toEqual({ command: 'list', db: '.local/offers.sqlite' });
  });
  it('accepts an explicit database and JSON input without interpreting either', () => {
    expect(parseOfferOptions(['create', '--input', '/tmp/offer.json', '--db', '/tmp/team.sqlite']))
      .toEqual({ command: 'create', input: '/tmp/offer.json', db: '/tmp/team.sqlite' });
  });
  it('requires the relevant actor for each local mutation', () => {
    expect(parseOfferOptions(['publish', '--id', 'offer-1', '--seller', 'seller']))
      .toMatchObject({ command: 'publish', id: 'offer-1', seller: 'seller' });
    expect(parseOfferOptions(['prepare', '--id', 'offer-1', '--buyer', 'buyer']))
      .toMatchObject({ command: 'prepare', id: 'offer-1', buyer: 'buyer' });
    expect(() => parseOfferOptions(['cancel', '--id', 'offer-1'])).toThrow('--seller');
    expect(() => parseOfferOptions(['show'])).toThrow('--id');
  });
  it('rejects unknown, duplicate, irrelevant or missing values before opening a database', () => {
    for (const args of [[], ['settle'], ['list', '--seller', 'x'], ['list', '--db', 'a', '--db', 'b'], ['create', '--input'], ['show', '--id', '--db', 'x']]) {
      expect(() => parseOfferOptions(args)).toThrow();
    }
  });
});
