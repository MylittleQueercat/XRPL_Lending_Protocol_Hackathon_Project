import type { Request } from 'xrpl';
import { shutdownClient } from './commands.js';
import { LedgerReader } from './ledger-reader.js';
import { createClient } from './network.js';
import { parseReadOptions } from './read-options.js';
import { valuePosition } from './valuation.js';

const client = createClient();
try {
  const options = parseReadOptions(process.argv.slice(2));
  await client.connect();
  const reader = new LedgerReader({
    request: (request) => client.request(request as Request),
    reconnect: async () => {
      await client.disconnect();
      await client.connect();
    },
  });
  if (options.command === 'position') {
    const snapshot = await reader.readPosition({
      vaultId: options.vaultId,
      holder: options.holder,
      ...(options.loanBrokerId ? { loanBrokerId: options.loanBrokerId } : {}),
      ...(options.loanId ? { loanId: options.loanId } : {}),
    });
    const valuation = valuePosition({
      assetsTotalDrops: snapshot.assetsTotalDrops,
      assetsAvailableDrops: snapshot.assetsAvailableDrops,
      lossUnrealizedDrops: snapshot.lossUnrealizedDrops,
      totalSharesRaw: snapshot.totalSharesRaw,
      heldSharesRaw: snapshot.heldSharesRaw,
      shareScale: snapshot.shareScale,
      ...(options.offeredSharesRaw !== undefined ? { offeredSharesRaw: options.offeredSharesRaw } : {}),
      ...(options.askingPriceDrops !== undefined ? { askingPriceDrops: options.askingPriceDrops } : {}),
    });
    console.log(JSON.stringify({ snapshot, valuation }, null, 2));
  } else {
    const submitted = reader.beginTracking(options.hash, options.lastLedgerSequence);
    const current = await reader.pollTransaction(options.hash);
    console.log(JSON.stringify({ trackingStarted: submitted, current }, null, 2));
  }
} catch (error) {
  console.error(JSON.stringify({ status: 'error', message: error instanceof Error ? error.message : 'Read failed' }));
  process.exitCode = 1;
} finally {
  await shutdownClient(client);
}
