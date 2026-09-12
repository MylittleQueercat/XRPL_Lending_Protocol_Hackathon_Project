import { join } from 'node:path';
import { executeCommand, shutdownClient } from './commands.js';
import { createClient, inspectNetwork } from './network.js';
import { createRunDirectory, writePrivateJson } from './storage.js';
import { runVanillaFlow } from './lending.js';
import { runSettlementFailures } from './settlement.js';
import { runVaultSmoke } from './vault.js';

const client = createClient();
try {
  process.exitCode = await executeCommand(process.argv[2] ?? 'doctor', {
    inspect: async () => {
      const report = await inspectNetwork(client);
      const directory = await createRunDirectory('doctor');
      await writePrivateJson(join(directory, 'network.json'), report);
      return report;
    },
    smoke: (report) => runVaultSmoke(client, report),
    vanilla: (report) => runVanillaFlow(client, report),
    settlement: (report) => runSettlementFailures(client, report),
    output: (value) => console.log(JSON.stringify(value, null, 2)),
  });
} catch (error) {
  console.error(JSON.stringify({ status: 'error', message: error instanceof Error ? error.message : 'Unknown failure' }));
  process.exitCode = 1;
} finally {
  await shutdownClient(client);
}
