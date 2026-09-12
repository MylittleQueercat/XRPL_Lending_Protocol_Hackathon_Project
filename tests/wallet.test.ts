import { describe, expect, it } from 'vitest';
import { assertSupportedTransaction, assertWalletReady, publicWalletStatus, signTrack1, WalletOperationError, type Track1Signer } from '../src/wallet.js';

const account = 'rHmFRk6rLPAbWzDXH1nUvxbhHgQiMxXag';
const signer = (overrides: Partial<Track1Signer> = {}): Track1Signer => ({
  connected: true, account, networkId: 4001,
  sign: async () => ({ tx_blob: 'BLOB', hash: 'A'.repeat(64) }), ...overrides,
});
const payment = { TransactionType: 'Payment', Account: account, Destination: 'rKqW5QpW4LfGfRzDAjEv2cpAkDnS2Utin5', Amount: '1' } as never;

describe('Track 1 wallet boundary', () => {
  it('accepts the custom network and exposes only public status', () => {
    expect(publicWalletStatus(signer())).toEqual({ connected: true, account, networkId: 4001, network: 'Track 1 custom Devnet' });
  });
  it('blocks a wrong network before signing', async () => {
    await expect(signTrack1(payment, signer({ networkId: 0 }))).rejects.toMatchObject({ code: 'WRONG_NETWORK' });
  });
  it('blocks a disconnected wallet before signing', async () => {
    await expect(signTrack1(payment, signer({ connected: false }))).rejects.toMatchObject({ code: 'DISCONNECTED' });
  });
  it('handles a user-rejected signature without submission', async () => {
    const rejected = signer({ sign: async () => { throw new Error('User rejected request'); } });
    await expect(signTrack1(payment, rejected)).rejects.toMatchObject({ code: 'SIGNING_REJECTED' });
  });
  it('rejects transaction types outside the demonstrated surface', () => {
    expect(() => assertSupportedTransaction({ TransactionType: 'OfferCreate' } as never)).toThrowError(WalletOperationError);
  });
  it('does not accept a seed or private key as connection state', () => {
    const status = publicWalletStatus(signer());
    expect(status).not.toHaveProperty('seed');
    expect(status).not.toHaveProperty('privateKey');
  });
  it('asserts readiness independently for connector UIs', () => {
    expect(() => assertWalletReady(signer())).not.toThrow();
  });
});
