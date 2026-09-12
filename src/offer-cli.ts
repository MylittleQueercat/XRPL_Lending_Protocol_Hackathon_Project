import { mkdir, open } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Request } from 'xrpl';
import { shutdownClient } from './commands.js';
import { LedgerReader } from './ledger-reader.js';
import { createClient } from './network.js';
import { parseOfferOptions } from './offer-options.js';
import { SqliteOfferStore } from './offer-store.js';
import { OfferService } from './offers.js';

async function readInput(path: string): Promise<unknown> {
  const file = await open(path, 'r');
  try {
    // Read at most the limit plus one byte; a changing file cannot evade the bound.
    const buffer = Buffer.alloc(65_537);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await file.read(buffer, length, buffer.length - length, null);
      if (bytesRead === 0) break;
      length += bytesRead;
    }
    if (length > 65_536) throw new Error('Offer input exceeds 64 KiB.');
    return JSON.parse(buffer.subarray(0, length).toString('utf8')) as unknown;
  } finally {
    await file.close();
  }
}

const client = createClient();
let store: SqliteOfferStore | undefined;
try {
  const options = parseOfferOptions(process.argv.slice(2));
  const input = options.command === 'create' ? await readInput(options.input) : undefined;
  await mkdir(dirname(options.db), { recursive: true });
  store = new SqliteOfferStore(options.db);
  const reader = new LedgerReader({
    request: (request) => client.request(request as Request),
    reconnect: async () => { await client.disconnect(); await client.connect(); },
  });
  const service = new OfferService(store, {
    readPosition: async (position) => {
      if (!client.isConnected()) await client.connect();
      return reader.readPosition(position);
    },
  });
  let result: unknown;
  switch (options.command) {
    case 'create': result = service.createDraft(input); break;
    case 'list': result = service.list({ state: 'open' }); break;
    case 'show': result = service.get(options.id); break;
    case 'publish': result = service.publish(options.id, options.seller); break;
    case 'cancel': result = service.cancel(options.id, options.seller); break;
    case 'prepare': result = await service.prepareSettlement(options.id, options.buyer); break;
  }
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(JSON.stringify({ status: 'error', message: error instanceof Error ? error.message : 'Offer command failed' }));
  process.exitCode = 1;
} finally {
  store?.close();
  await shutdownClient(client);
}
