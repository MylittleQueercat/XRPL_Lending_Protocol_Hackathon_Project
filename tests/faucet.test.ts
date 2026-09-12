import { expect, it } from 'vitest';
import { Wallet } from 'xrpl';
import { parseFaucetWallet } from '../src/vault.js';
it('handles the hackathon faucet generated-wallet response', () => {
  const generated = Wallet.generate();
  const wallet = parseFaucetWallet({ account: { address: generated.address, secret: generated.seed }, balance: 1000 });
  expect(wallet.address).toBe(generated.address);
});
it('rejects a returned address that does not match the faucet signing seed', () => {
  const generated = Wallet.generate();
  expect(() => parseFaucetWallet({ account: { address: Wallet.generate().address, secret: generated.seed } })).toThrow(/match/i);
});
it('rejects unexpected faucet schemas without echoing the body', () => {
  expect(() => parseFaucetWallet({ error: 'synthetic-sensitive-text' })).toThrow(/account/i);
  expect(() => parseFaucetWallet({ account: { secret: 'synthetic-sensitive-text' } })).not.toThrow(/synthetic-sensitive-text/);
});
