import { expect, it } from 'vitest';
import { validate, Wallet, VaultCreateFlags } from 'xrpl';
import { buildVaultCreate, assertBalanceDelta } from '../src/vault.js';
it('builds a public transferable XRP vault accepted by the installed SDK', () => {
  const transaction = buildVaultCreate(Wallet.generate().address);
  expect(() => validate(transaction)).not.toThrow();
  expect(transaction.Asset).toEqual({ currency: 'XRP' });
  expect(Number(transaction.Flags) & VaultCreateFlags.tfVaultShareNonTransferable).toBe(0);
  expect(Number(transaction.Flags) & VaultCreateFlags.tfVaultPrivate).toBe(0);
});
it('checks XRP received net of a withdrawal transaction fee', () => {
  expect(() => assertBalanceDelta('20000000', '29999990', '10000000', '10')).not.toThrow();
  expect(() => assertBalanceDelta('20000000', '20000000', '10000000', '10')).toThrow(/balance/i);
});
it('checks deposits without floating point loss', () => {
  expect(() => assertBalanceDelta('50000000', '39999990', '-10000000', '10')).not.toThrow();
});
