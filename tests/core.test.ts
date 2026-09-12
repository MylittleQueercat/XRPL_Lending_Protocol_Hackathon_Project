import { describe, expect, it } from 'vitest';
import { assessNetwork, assertValidated, parseXrp, track1Config } from '../src/core.js';

const info = { network_id: 4001, server_state: 'full', build_version: '3.4.0-rc1', validated_ledger: { seq: 100, age: 2 } };
const features = {
  vault: { name: 'SingleAssetVault', enabled: true },
  lending: { name: 'LendingProtocol', enabled: true },
};

describe('Track 1 network safety', () => {
  it('recognizes a fresh matching Track 1 node', () => {
    expect(assessNetwork(info, info, features).vanillaReady).toBe(true);
  });
  it('rejects mainnet even if the amendments are enabled', () => {
    expect(() => assessNetwork({ ...info, network_id: 0 }, info, features)).toThrow(/network/i);
  });
  it('rejects disagreement between HTTP and WebSocket endpoints', () => {
    expect(() => assessNetwork(info, { ...info, network_id: 1 }, features)).toThrow(/network/i);
  });
  it('fails closed when amendment support is unknown', () => {
    expect(assessNetwork(info, info, {}).vaultReady).toBe(false);
  });
  it('allows the XLS-65 smoke but blocks open-ended lending on V1.1', () => {
    const result = assessNetwork(info, info, { ...features, v11: { name: 'LendingProtocolV1_1', enabled: true } });
    expect(result.vaultReady).toBe(true);
    expect(result.vanillaReady).toBe(false);
    expect(result.blockers.join(' ')).toMatch(/closed-ended/);
  });
  it('rejects stale ledgers before faucet funding or signing', () => {
    expect(() => assessNetwork({ ...info, validated_ledger: { seq: 100, age: 90 } }, info, features)).toThrow(/stale/i);
  });
  it('does not accept a typo as a custom network override', () => {
    expect(() => track1Config({ XRPL_WS_URL: 'wss://s.altnet.rippletest.net:51233' })).toThrow(/fixed/i);
  });
});

describe('XRP amounts', () => {
  it('converts decimal strings exactly to drops', () => {
    expect(parseXrp('10.000001')).toBe('10000001');
  });
  it.each(['0', '-1', '1e3', '0.0000001', 'NaN', ' 2', '01', ''])('rejects invalid positive XRP: %s', (amount) => {
    expect(() => parseXrp(amount)).toThrow();
  });
});

describe('validated ledger results', () => {
  const transaction = { validated: true, hash: 'A'.repeat(64), ledger_index: 5, meta: { TransactionResult: 'tesSUCCESS', AffectedNodes: [] } };
  it('accepts a successful validated transaction', () => {
    expect(assertValidated(transaction)).toMatchObject({ hash: 'A'.repeat(64), ledgerIndex: 5, resultCode: 'tesSUCCESS' });
  });
  it('does not mistake a tentative success for finality', () => {
    expect(() => assertValidated({ ...transaction, validated: false })).toThrow(/validated/i);
  });
  it('does not mistake a validated tec result for success', () => {
    expect(() => assertValidated({ ...transaction, meta: { TransactionResult: 'tecINSUFFICIENT_FUNDS' } })).toThrow(/tecINSUFFICIENT_FUNDS/);
  });
  it('does not accept missing metadata or a missing transaction hash', () => {
    expect(() => assertValidated({ ...transaction, meta: undefined })).toThrow();
    expect(() => assertValidated({ ...transaction, hash: undefined })).toThrow();
  });
});
