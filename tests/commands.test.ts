import { expect, it, vi } from 'vitest';
import { executeCommand } from '../src/commands.js';
import { assessNetwork } from '../src/core.js';

const info = { network_id: 4001, server_state: 'full', build_version: 'test', validated_ledger: { seq: 10, age: 1 } };
const report = assessNetwork(info, info, {
  a: { name: 'SingleAssetVault', enabled: true }, b: { name: 'LendingProtocol', enabled: true },
  c: { name: 'LendingProtocolV1_1', enabled: true },
});
it('vanilla runs the lending flow when V1.1 is enabled', async () => {
  // V1.1 is an accounting caveat, not a reason to refuse: open-ended origination works.
  const vanilla = vi.fn(async () => ({ fullVanillaComplete: true }));
  expect(await executeCommand('vanilla', { inspect: async () => report, smoke: vi.fn(), vanilla, output: () => {} })).toBe(0);
  expect(vanilla).toHaveBeenCalledOnce();
});
it('vanilla refuses to fund or sign when a required amendment is missing', async () => {
  const blocked = assessNetwork(info, info, { a: { name: 'SingleAssetVault', enabled: true } });
  const vanilla = vi.fn();
  await expect(executeCommand('vanilla', { inspect: async () => blocked, smoke: vi.fn(), vanilla, output: () => {} })).rejects.toThrow(/LendingProtocol/);
  expect(vanilla).not.toHaveBeenCalled();
});
it('doctor reports a compatible lending track when V1.1 is enabled', async () => {
  const output = vi.fn();
  expect(await executeCommand('doctor', { inspect: async () => report, smoke: vi.fn(), vanilla: vi.fn(), output })).toBe(0);
  expect(output).toHaveBeenCalledWith(report);
});
it('vault smoke is an explicit command and remains available with V1.1', async () => {
  const smoke = vi.fn(async () => ({ status: 'verified' }));
  expect(await executeCommand('vault-smoke', { inspect: async () => report, smoke, vanilla: vi.fn(), output: () => {} })).toBe(0);
  expect(smoke).toHaveBeenCalledOnce();
});
it('unknown commands do not connect or fund wallets', async () => {
  const inspect = vi.fn();
  await expect(executeCommand('typo', { inspect, smoke: vi.fn(), vanilla: vi.fn(), output: () => {} })).rejects.toThrow(/Usage/);
  expect(inspect).not.toHaveBeenCalled();
});

it('cancels SDK reconnect work even when the transport is already disconnected', async () => {
  const { shutdownClient } = await import('../src/commands.js');
  const client = { isConnected: () => false, disconnect: vi.fn(async () => {}) };
  await shutdownClient(client);
  expect(client.disconnect).toHaveBeenCalledOnce();
});
