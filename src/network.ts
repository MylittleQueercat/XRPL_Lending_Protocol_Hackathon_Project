import { Client } from 'xrpl';
import { assessNetwork, record, track1Config } from './core.js';

export function createClient(): Client {
  return new Client(track1Config().wsUrl, { connectionTimeout: 15_000, timeout: 20_000 });
}

export async function inspectNetwork(client: Client) {
  const config = track1Config();
  if (!client.isConnected()) await client.connect();
  const [httpResponse, websocket, amendments] = await Promise.all([
    fetch(config.rpcUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'server_info', params: [{}] }), signal: AbortSignal.timeout(15_000),
    }),
    client.request({ command: 'server_info' }), client.request({ command: 'feature' }),
  ]);
  if (!httpResponse.ok) throw new Error(`Track 1 HTTP endpoint returned ${httpResponse.status}.`);
  const http = record(await httpResponse.json(), 'HTTP response');
  const httpResult = record(http.result, 'HTTP result');
  return assessNetwork(httpResult.info, websocket.result.info, amendments.result.features);
}
