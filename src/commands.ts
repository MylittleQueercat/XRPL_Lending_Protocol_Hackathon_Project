import type { NetworkReport } from './core.js';
interface CommandServices {
  inspect: () => Promise<NetworkReport>;
  smoke: (report: NetworkReport) => Promise<unknown>;
  vanilla: (report: NetworkReport) => Promise<unknown>;
  output: (value: unknown) => void;
}
export async function executeCommand(command: string, services: CommandServices): Promise<number> {
  if (!['doctor', 'vanilla', 'vault-smoke'].includes(command)) throw new Error('Usage: doctor | vault-smoke | vanilla');
  const report = await services.inspect();
  if (command === 'doctor') {
    services.output(report);
    return report.vanillaReady ? 0 : 2;
  }
  if (command === 'vanilla') {
    if (report.blockers.length) throw new Error(`${report.blockers.join(' ')} No funding or signing was attempted.`);
    services.output(await services.vanilla(report));
    return 0;
  }
  if (!report.vaultReady) throw new Error('SingleAssetVault is not enabled; no funding or signing was attempted.');
  services.output(await services.smoke(report));
  return 0;
}

export async function shutdownClient(client: { disconnect: () => Promise<void> }): Promise<void> {
  // XRPL may have a reconnect timer even when the WebSocket is already closed.
  await client.disconnect();
}
