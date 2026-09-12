import { Client, Wallet, type SubmittableTransaction } from 'xrpl';
import { signTrack1, type Track1Signer } from '../../src/wallet.js';
import { assertValidated, TRACK1 } from '../../src/core.js';

// Opt-in live test: creates one disposable faucet account and one MPTokenAuthorize.
// The faucet seed is held only in memory and is never logged or written to disk.
const SHARE_MPT_ID = '000000016D8E5748CD5FA882BDFF41D6619F430CF479D096';
const client = new Client(TRACK1.wsUrl, { connectionTimeout: 15_000, timeout: 20_000 });

await client.connect();
try {
  const server = (await client.request({ command: 'server_info' })).result.info;
  if (server.network_id !== TRACK1.networkId) throw new Error(`Unexpected Track 1 network: ${String(server.network_id)}`);
  const faucetResponse = await fetch(TRACK1.faucetUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(30_000) });
  if (!faucetResponse.ok) throw new Error(`Track 1 faucet returned HTTP ${faucetResponse.status}`);
  const faucet = await faucetResponse.json() as { account?: { address?: string; secret?: string } };
  if (!faucet.account?.address || !faucet.account.secret) throw new Error('Faucet response did not contain an account.');
  const wallet = Wallet.fromSeed(faucet.account.secret);
  if (wallet.address !== faucet.account.address) throw new Error('Faucet address/seed mismatch.');
  const transaction = await client.autofill({ TransactionType: 'MPTokenAuthorize', Account: wallet.address, MPTokenIssuanceID: SHARE_MPT_ID } as SubmittableTransaction);
  if (transaction.NetworkID !== TRACK1.networkId) throw new Error('Autofill returned a transaction for the wrong network.');
  const signer: Track1Signer = {
    connected: true, account: wallet.address, networkId: TRACK1.networkId,
    sign: async (tx) => wallet.sign(tx),
  };
  const signed = await signTrack1(transaction, signer);
  const result = (await client.submitAndWait(signed.tx_blob)).result;
  const validated = assertValidated(result);
  console.log(JSON.stringify({
    wallet_mode: 'xrpl.js Wallet via src/wallet.ts', network: 'Track 1 custom Devnet', network_id: TRACK1.networkId,
    account: wallet.address, transaction_type: transaction.TransactionType, hash: result.hash,
    validated: true, ledger_index: validated.ledgerIndex, engine_result: validated.resultCode,
    fee_drops: transaction.Fee, explorer: `${TRACK1.explorerUrl}/transactions/${result.hash}`,
  }, null, 2));
} finally {
  await client.disconnect();
}
