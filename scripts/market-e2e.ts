// Explicit live verification: creates fresh faucet wallets and test-network objects.
// No existing wallet is read, and no secret is written to public evidence.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { sign } from 'ripple-keypairs';
import { LoanPayFlags, signLoanSetByCounterparty, type AccountObjectsRequest, type LoanSet, type SubmittableTransaction, type Wallet } from 'xrpl';
import { createClient, inspectNetwork } from '../src/network.js';
import { assertValidated, record, TRACK1 } from '../src/core.js';
import { buildVaultCreate, fundWallet, readBalance } from '../src/vault.js';
import { buildLoanBrokerSet, buildLoanSet, createdEntry } from '../src/lending.js';
import { createRunDirectory, writePrivateJson } from '../src/storage.js';
import { signBuyerSale, signSellerSale } from '../web/src/lib/market-signing.js';
import { toDisplayOffer, validateMarketChallenge } from '../web/src/lib/market-client.js';
import type { MarketAction, MarketChallenge, MarketSnapshot } from '../src/market-types.js';

const origin = process.env.RAISE_MARKET_ORIGIN ?? 'http://localhost:3000';
const url = new URL(origin);
if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.origin !== origin) throw new Error('Live verification targets a local Raise server only.');
const client = createClient();
const transactions: Array<Record<string, unknown>> = [];
const snapshots: Array<Record<string, unknown>> = [];
const directory = await createRunDirectory('market-e2e');

async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${origin}${path}`, {
    method: body === undefined ? 'GET' : 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(45000),
  });
  const data: unknown = await response.json();
  if (!response.ok) throw new Error(`Raise API ${response.status}: ${String(record(data, 'API error').error)}`);
  return data as T;
}
async function act(wallet: Wallet, action: MarketAction): Promise<MarketSnapshot> {
  const challenge = await api<MarketChallenge>('/api/market/challenge', { account: wallet.classicAddress, action });
  validateMarketChallenge(challenge, action, wallet.classicAddress, origin);
  const signature = sign(Buffer.from(challenge.message).toString('hex'), wallet.privateKey);
  return api<MarketSnapshot>('/api/market', { challengeId: challenge.id, publicKey: wallet.publicKey, signature });
}
async function submit(label: string, tx: SubmittableTransaction, wallet: Wallet, counterparty?: Wallet, allowFailure = false) {
  const prepared = await client.autofill(tx);
  assert.equal(prepared.NetworkID, 4001);
  let signed = wallet.sign(prepared);
  if (counterparty) signed = signLoanSetByCounterparty(counterparty, signed.tx_blob as unknown as LoanSet);
  await writePrivateJson(join(directory, `${label}-intent.json`), { hash: signed.hash, lastLedgerSequence: prepared.LastLedgerSequence });
  const result = (await client.submitAndWait(signed.tx_blob)).result;
  assert.equal(result.validated, true);
  assert.equal(result.hash, signed.hash);
  assert(typeof result.ledger_index === 'number');
  const meta = record(result.meta, 'validated metadata');
  if (!allowFailure) assertValidated(result);
  const evidence = { label, transactionType: tx.TransactionType, hash: signed.hash, ledgerIndex: result.ledger_index, resultCode: String(meta.TransactionResult), feeDrops: String(prepared.Fee), explorer: `${TRACK1.explorerUrl}/transactions/${signed.hash}` };
  transactions.push(evidence);
  process.stdout.write(`Verified ${label}: ${evidence.resultCode}\n`);
  return { ...evidence, meta };
}
async function entry(index: string, ledgerIndex: number) {
  const result = (await client.request({ command: 'ledger_entry', index, ledger_index: ledgerIndex })).result;
  assert.equal(result.validated, true); return record(result.node, 'entry');
}
async function shares(account: string, issuance: string, ledgerIndex: number) {
  let marker: unknown;
  do {
    const result = (await client.request({ command: 'account_objects', account, type: 'mptoken', ledger_index: ledgerIndex, ...(marker === undefined ? {} : { marker }) } as AccountObjectsRequest)).result as unknown as Record<string,unknown>;
    assert.equal(result.validated, true);
    for (const item of result.account_objects as Array<Record<string,unknown>>) if (item.MPTokenIssuanceID === issuance) return String(item.MPTAmount ?? '0');
    marker = result.marker;
  } while (marker !== undefined);
  return '0';
}

try {
  const network = await inspectNetwork(client);
  assert.equal(network.networkId, 4001); assert.equal(network.vanillaReady, true);
  await api<MarketSnapshot>('/api/market'); // Fail before funding if integration is unavailable.
  const broker = await fundWallet(client, 'broker', directory);
  const seller = await fundWallet(client, 'seller', directory);
  const borrower = await fundWallet(client, 'borrower', directory);
  const buyer = await fundWallet(client, 'buyer', directory);
  const create = await submit('create-vault', buildVaultCreate(broker.address), broker);
  const vaultId = createdEntry(create.meta, 'Vault');
  const deposit = await submit('deposit', { TransactionType: 'VaultDeposit', Account: seller.address, VaultID: vaultId, Amount: '100000000' }, seller);
  const vault = await entry(vaultId, deposit.ledgerIndex);
  const shareMptId = String(vault.ShareMPTID);
  async function snapshot(label: string, ledgerIndex: number) {
    const state = await entry(vaultId, ledgerIndex);
    const issuance = (await client.request({ command: 'ledger_entry', mpt_issuance: shareMptId, ledger_index: ledgerIndex })).result;
    assert.equal(issuance.validated, true);
    const [sellerShares, buyerShares, sellerXrp, buyerXrp, borrowerXrp] = await Promise.all([shares(seller.address, shareMptId, ledgerIndex), shares(buyer.address, shareMptId, ledgerIndex), readBalance(client, seller.address, ledgerIndex), readBalance(client, buyer.address, ledgerIndex), readBalance(client, borrower.address, ledgerIndex)]);
    const value = { label, ledgerIndex, sellerShares, buyerShares, sellerXrp, buyerXrp, borrowerXrp, assetsAvailableDrops: String(state.AssetsAvailable ?? '0'), assetsTotalDrops: String(state.AssetsTotal ?? '0'), totalShares: String(record(issuance.node, 'issuance').OutstandingAmount ?? '0') };
    snapshots.push(value); return value;
  }
  const funded = await snapshot('after-deposit', deposit.ledgerIndex);
  assert.equal(funded.assetsAvailableDrops, '100000000');
  assert.equal(funded.sellerShares, funded.totalShares);
  const brokerSet = await submit('create-broker', buildLoanBrokerSet(broker.address, vaultId), broker);
  const brokerId = createdEntry(brokerSet.meta, 'LoanBroker');
  await submit('cover', { TransactionType: 'LoanBrokerCoverDeposit', Account: broker.address, LoanBrokerID: brokerId, Amount: '20000000' } as SubmittableTransaction, broker);
  const loan = await submit('originate-loan', buildLoanSet(broker.address, borrower.address, brokerId), broker, borrower);
  const loanId = createdEntry(loan.meta, 'Loan');
  const originated = await snapshot('after-loan', loan.ledgerIndex);
  assert.equal(originated.assetsAvailableDrops, '50000000');
  assert.equal(BigInt(originated.borrowerXrp) - BigInt(funded.borrowerXrp), 50000000n);
  const refusal = await submit('unavailable-withdrawal', { TransactionType: 'VaultWithdraw', Account: seller.address, VaultID: vaultId, Amount: '100000000' }, seller, undefined, true);
  assert.equal(refusal.resultCode, 'tecINSUFFICIENT_FUNDS');
  const refused = await snapshot('after-refusal', refusal.ledgerIndex);
  assert.equal(refused.sellerShares, funded.sellerShares);
  await submit('buyer-authorize', { TransactionType: 'MPTokenAuthorize', Account: buyer.address, MPTokenIssuanceID: shareMptId } as SubmittableTransaction, buyer);
  const listing = await act(seller, { type: 'create', input: { networkId: 4001, vaultId, shareMptId, seller: seller.address, sharesRaw: funded.sellerShares, priceAsset: { currency: 'XRP' }, priceDrops: '95000000', expiresAt: new Date(Date.now() + 3600000).toISOString() } });
  const offer = listing.offers.find(item => item.vaultId === vaultId);
  assert(offer && offer.state === 'open');
  const independentRead = await api<MarketSnapshot>('/api/market');
  assert(independentRead.offers.some(item => item.id === offer.id));
  const prepared = await act(buyer, { type: 'prepare', offerId: offer.id });
  const attempt = prepared.attempts.find(item => item.offerId === offer.id);
  assert(attempt && attempt.status === 'awaiting-buyer');
  const beforeSale = await snapshot('before-sale', prepared.offers.find(item => item.id === offer.id)!.settlement!.ledger.index);
  const buyerBatch = signBuyerSale(toDisplayOffer(offer), attempt, buyer);
  const buyerSigned = await act(buyer, { type: 'buyer-sign', offerId: offer.id, batch: buyerBatch });
  const sellerRequest = buyerSigned.attempts.find(item => item.offerId === offer.id);
  assert(sellerRequest && sellerRequest.status === 'awaiting-seller');
  const blob = signSellerSale(toDisplayOffer(offer), sellerRequest, seller);
  let outcome = await act(seller, { type: 'seller-submit', offerId: offer.id, txBlob: blob });
  for (let poll = 0; poll < 25 && outcome.offers.find(item => item.id === offer.id)?.state !== 'settled'; poll++) {
    await delay(1000);
    outcome = await act(buyer, { type: 'reconcile', offerId: offer.id });
  }
  const completed = outcome.offers.find(item => item.id === offer.id);
  assert(completed?.state === 'settled' && completed.settlement?.proof, 'Sale not proven; leave the persisted attempt pending. Never resubmit.');
  const proof = completed.settlement.proof;
  transactions.push({ label: 'shared-market-sale', transactionType: 'Batch', hash: proof.transactionHash, ledgerIndex: proof.ledgerIndex, resultCode: 'tesSUCCESS', explorer: `${TRACK1.explorerUrl}/transactions/${proof.transactionHash}` });
  const sold = await snapshot('after-sale', proof.ledgerIndex);
  assert.equal(sold.sellerShares, '0'); assert.equal(sold.buyerShares, funded.sellerShares);
  assert.equal(BigInt(beforeSale.buyerXrp) - BigInt(sold.buyerXrp), 95000000n);
  const outer = (await client.request({ command: 'tx', transaction: proof.transactionHash })).result;
  const fee = BigInt(String(record(outer.tx_json, 'sale transaction').Fee));
  assert.equal(BigInt(sold.sellerXrp) - BigInt(beforeSale.sellerXrp) + fee, 95000000n);
  const repay = await submit('borrower-repay', { TransactionType: 'LoanPay', Account: borrower.address, LoanID: loanId, Amount: '200000000', Flags: LoanPayFlags.tfLoanFullPayment } as SubmittableTransaction, borrower);
  const repaid = await snapshot('after-repayment', repay.ledgerIndex);
  assert(BigInt(repaid.assetsAvailableDrops) >= 100000000n);
  const redeemed = await submit('buyer-redeem', { TransactionType: 'VaultWithdraw', Account: buyer.address, VaultID: vaultId, Amount: repaid.assetsAvailableDrops }, buyer);
  const final = await snapshot('after-buyer-redemption', redeemed.ledgerIndex);
  assert.equal(final.totalShares, '0'); assert.equal(final.buyerShares, '0');
  assert.equal(final.assetsAvailableDrops, '0'); assert.equal(final.assetsTotalDrops, '0');
  assert.equal(BigInt(final.buyerXrp) - BigInt(repaid.buyerXrp) + BigInt(redeemed.feeDrops), BigInt(repaid.assetsAvailableDrops));
  const evidence = { checkedAt: new Date().toISOString(), sdk: 'xrpl@5.2.0-beta.1', node: process.version, networkId: 4001, origin, scope: 'Real HTTP API + SQLite + production client signing helpers + event ledger; separate actor wallets. Browser clicks are verified separately.', network, actors: { broker: broker.address, seller: seller.address, borrower: borrower.address, buyer: buyer.address }, vaultId, loanId, shareMptId, offerId: offer.id, settlementProof: proof, transactions, snapshots, result: 'passed' };
  await writeFile('evidence/market-e2e.json', `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write('Full shared marketplace journey passed; sanitized evidence/market-e2e.json written.\n');
} catch (error) {
  await writePrivateJson(join(directory, 'stopped.json'), { transactions, snapshots });
  process.stderr.write(`Live journey stopped: ${error instanceof Error ? error.message : 'unknown failure'}. No automatic resubmission.\n`);
  process.exitCode = 1;
} finally { await client.disconnect(); }
