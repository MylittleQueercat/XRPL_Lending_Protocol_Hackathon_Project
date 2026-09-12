export const TRACK1 = Object.freeze({
  rpcUrl: 'https://lending-hackathon.dev.ripplex.io:51234',
  wsUrl: 'wss://lending-hackathon.dev.ripplex.io:51233',
  faucetUrl: 'https://lending-hackathon-faucet.dev.ripplex.io/accounts',
  networkId: 4001,
  explorerUrl: 'https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233',
});

export function track1Config(env: Record<string, string | undefined> = process.env) {
  for (const [key, expected] of [
    ['XRPL_RPC_URL', TRACK1.rpcUrl], ['XRPL_WS_URL', TRACK1.wsUrl],
    ['XRPL_FAUCET_URL', TRACK1.faucetUrl], ['XRPL_NETWORK_ID', String(TRACK1.networkId)],
  ]) {
    if (key && env[key] !== undefined && env[key] !== expected) {
      throw new Error(`${key} is fixed to the Track 1 hackathon configuration. Do not mix networks.`);
    }
  }
  return TRACK1;
}

export function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Missing or invalid ${label}.`);
  return value as Record<string, unknown>;
}

function checkNode(value: unknown, transport: string) {
  const info = record(value, `${transport} server_info`);
  if (info.network_id !== TRACK1.networkId) throw new Error(`${transport} network mismatch: expected ${TRACK1.networkId}. No transactions permitted.`);
  const ledger = record(info.validated_ledger, `${transport} validated ledger`);
  if (!['full', 'validating', 'proposing'].includes(String(info.server_state))) throw new Error(`${transport} node is not synchronized.`);
  if (typeof ledger.age !== 'number' || ledger.age < 0 || ledger.age > 30) throw new Error(`${transport} validated ledger is stale or its age is unknown.`);
  if (typeof ledger.seq !== 'number' || ledger.seq < 1) throw new Error(`${transport} validated ledger index is missing.`);
  return { build: String(info.build_version), ledgerIndex: ledger.seq, ledgerAgeSeconds: ledger.age };
}

export function assessNetwork(httpInfo: unknown, wsInfo: unknown, featuresValue: unknown) {
  const http = checkNode(httpInfo, 'HTTP');
  const websocket = checkNode(wsInfo, 'WebSocket');
  const features = Object.entries(record(featuresValue, 'amendments')).map(([id, value]) => {
    const feature = record(value, 'amendment');
    return { id, name: String(feature.name), enabled: feature.enabled === true };
  });
  const enabled = (name: string) => features.some((feature) => feature.name === name && feature.enabled);
  const vaultReady = enabled('SingleAssetVault');
  const blockers: string[] = [];
  const notes: string[] = [];
  if (!vaultReady) blockers.push('SingleAssetVault is not confirmed enabled.');
  if (!enabled('LendingProtocol')) blockers.push('LendingProtocol is not confirmed enabled.');
  // LendingProtocolV1_1 is enabled on the event network. It was expected to block open-ended
  // lending; measured on 2026-09-12 it does not. The full Track 1 open-ended flow was validated
  // on ledger: VaultCreate, VaultDeposit, LoanBrokerSet, LoanBrokerCoverDeposit, LoanSet
  // (tesSUCCESS, 06990570A9F48B138C4B4E98C1085DC8D30331CB17BD175E6924578E2D7094A0), the
  // insufficient-liquidity guardrail, LoanPay and VaultWithdraw. What the amendment does change is
  // accounting: a 400 XRP loan carrying 244.19 XRP of scheduled interest left AssetsTotal at
  // exactly 800.000000 XRP at origination, so interest is recognised on payment (cash basis),
  // not whole-life as V1 would. That is a reporting caveat, not a reason to refuse to run.
  if (enabled('LendingProtocolV1_1')) notes.push('LendingProtocolV1_1 is enabled: open-ended loan origination works, but interest is recognised on payment (cash basis), not at origination. Document yield on that basis.');
  return {
    checkedAt: new Date().toISOString(), networkId: TRACK1.networkId, reachable: true,
    http, websocket, vaultReady, vanillaReady: blockers.length === 0, blockers, notes,
    amendments: features.filter((feature) => ['SingleAssetVault', 'LendingProtocol', 'LendingProtocolV1_1'].includes(feature.name)),
  };
}
export type NetworkReport = ReturnType<typeof assessNetwork>;

export function parseXrp(value: string): string {
  if (!/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(value)) throw new Error('Use a positive XRP decimal string with at most six decimal places.');
  const [whole = '0', fractional = ''] = value.split('.');
  const drops = BigInt(whole) * 1_000_000n + BigInt(fractional.padEnd(6, '0'));
  if (drops <= 0n || drops > 100_000_000_000_000_000n) throw new Error('XRP amount is outside the valid range.');
  return drops.toString();
}

export function assertValidated(value: unknown) {
  const result = record(value, 'transaction result');
  if (result.validated !== true) throw new Error('Transaction is not validated; never resubmit blindly.');
  const meta = record(result.meta, 'transaction metadata');
  if (meta.TransactionResult !== 'tesSUCCESS') throw new Error(`Validated transaction failed: ${String(meta.TransactionResult)}.`);
  if (typeof result.hash !== 'string' || !/^[A-Fa-f0-9]{64}$/.test(result.hash)) throw new Error('Validated transaction hash is missing.');
  if (typeof result.ledger_index !== 'number' || result.ledger_index < 1) throw new Error('Validated ledger index is missing.');
  return { hash: result.hash, ledgerIndex: result.ledger_index, resultCode: 'tesSUCCESS' as const };
}
