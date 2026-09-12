import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Client, MPTokenIssuanceCreateFlags, Wallet, type SubmittableTransaction, type VaultCreate } from 'xrpl';
import { assertValidated, parseXrp, record, TRACK1, type NetworkReport } from './core.js';
import { createRunDirectory, writePrivateJson } from './storage.js';

export function buildVaultCreate(address: string): VaultCreate {
  return { TransactionType: 'VaultCreate', Account: address, Asset: { currency: 'XRP' }, Flags: 0, WithdrawalPolicy: 1 };
}

export function assertBalanceDelta(before: string, after: string, expected: string, fee: string): void {
  if (BigInt(after) - BigInt(before) + BigInt(fee) !== BigInt(expected)) throw new Error('Validated XRP balance change does not match the expected asset movement and fee.');
}

async function balance(client: Client, address: string, ledgerIndex: number | 'validated' = 'validated') {
  const response = await client.request({ command: 'account_info', account: address, ledger_index: ledgerIndex });
  if (response.result.validated !== true) throw new Error('Account balance was not read from a validated ledger.');
  return response.result.account_data.Balance;
}

async function fund(client: Client, role: string, directory: string): Promise<Wallet> {
  const response = await fetch(TRACK1.faucetUrl, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}), signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Hackathon faucet returned HTTP ${response.status}. Do not retry repeatedly.`);
  }
  // This event faucet generates wallets and ignores destination; its body contains secrets.
  const wallet = parseFaucetWallet(await response.json());
  await writePrivateJson(join(directory, `${role}-wallet.json`), {
    warning: 'FAUCET-ONLY TEST WALLET. Never use with real assets. Never commit or share.',
    address: wallet.address, seed: wallet.seed,
  });
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const fundedBalance = await balance(client, wallet.address);
      if (BigInt(fundedBalance) < BigInt(parseXrp('50'))) throw new Error('Faucet balance is too low for this smoke run (50 XRP minimum per test wallet).');
      return wallet;
    } catch (error) {
      const data = error && typeof error === 'object' && 'data' in error ? error.data : undefined;
      if (!data || typeof data !== 'object' || !('error' in data) || data.error !== 'actNotFound') throw error;
      await delay(1_000);
    }
  }
  throw new Error('Faucet funding was not validated before timeout. Wallets remain saved locally; no blind resubmission occurred.');
}

async function submit(client: Client, transaction: SubmittableTransaction, wallet: Wallet, directory: string) {
  const prepared = await client.autofill(transaction);
  if (prepared.NetworkID !== TRACK1.networkId) throw new Error('Autofilled transaction has an unexpected NetworkID.');
  const signed = wallet.sign(prepared);
  // Record only the hash before submitting, so an uncertain outcome can be looked up safely.
  await writePrivateJson(join(directory, `${transaction.TransactionType}-intent.json`), { hash: signed.hash, transactionType: transaction.TransactionType, lastLedgerSequence: prepared.LastLedgerSequence });
  const result = (await client.submitAndWait(signed.tx_blob)).result;
  const validated = assertValidated(result);
  if (validated.hash !== signed.hash) throw new Error('Validated transaction hash differs from the locally signed hash.');
  const evidence = {
    ...validated, transactionType: transaction.TransactionType, feeDrops: String(prepared.Fee),
    explorer: `${TRACK1.explorerUrl}/transactions/${validated.hash}`,
  };
  await writePrivateJson(join(directory, `${transaction.TransactionType}.json`), evidence);
  return { evidence, meta: record(result.meta, 'transaction metadata') };
}

function createdVaultId(meta: Record<string, unknown>): string {
  if (!Array.isArray(meta.AffectedNodes)) throw new Error('VaultCreate metadata has no affected nodes.');
  for (const value of meta.AffectedNodes) {
    const node = record(value, 'affected node');
    if (!node.CreatedNode) continue;
    const created = record(node.CreatedNode, 'created node');
    if (created.LedgerEntryType === 'Vault' && typeof created.LedgerIndex === 'string') return created.LedgerIndex;
  }
  throw new Error('No newly created Vault was found in validated metadata.');
}

async function vaultState(client: Client, vaultId: string, ledgerIndex: number) {
  const response = await client.request({ command: 'ledger_entry', index: vaultId, ledger_index: ledgerIndex });
  if (response.result.validated !== true) throw new Error('Vault snapshot is not validated.');
  const vault = record(response.result.node, 'vault');
  if (vault.LedgerEntryType !== 'Vault' || typeof vault.ShareMPTID !== 'string') throw new Error('Unexpected vault ledger entry.');
  const issuanceResponse = await client.request({ command: 'ledger_entry', mpt_issuance: vault.ShareMPTID, ledger_index: ledgerIndex });
  if (issuanceResponse.result.validated !== true) throw new Error('Share issuance snapshot is not validated.');
  const issuance = record(issuanceResponse.result.node, 'share issuance');
  if (issuance.LedgerEntryType !== 'MPTokenIssuance') throw new Error('Unexpected share issuance entry.');
  const transferable = (Number(issuance.Flags) & MPTokenIssuanceCreateFlags.tfMPTCanTransfer) !== 0;
  if (!transferable) throw new Error('Vault shares are unexpectedly non-transferable.');
  return {
    ledgerIndex, vaultId, shareMptId: vault.ShareMPTID,
    assetsAvailableDrops: String(vault.AssetsAvailable ?? '0'), assetsTotalDrops: String(vault.AssetsTotal ?? '0'),
    outstandingShares: String(issuance.OutstandingAmount ?? '0'), transferable,
  };
}

export async function runVaultSmoke(client: Client, network: NetworkReport) {
  if (!network.vaultReady || network.networkId !== TRACK1.networkId) throw new Error('Vault smoke requires the verified hackathon network and SingleAssetVault.');
  const directory = await createRunDirectory('vault-smoke');
  await writePrivateJson(join(directory, 'network.json'), network);
  try {
    const owner = await fund(client, 'owner', directory);
    const lender = await fund(client, 'lender', directory);
    const create = await submit(client, buildVaultCreate(owner.address), owner, directory);
    const vaultId = createdVaultId(create.meta);
    const initial = await vaultState(client, vaultId, create.evidence.ledgerIndex);
    const depositDrops = parseXrp('10');
    const lenderBefore = await balance(client, lender.address);
    const deposit = await submit(client, { TransactionType: 'VaultDeposit', Account: lender.address, VaultID: vaultId, Amount: depositDrops }, lender, directory);
    const lenderAfterDeposit = await balance(client, lender.address, deposit.evidence.ledgerIndex);
    assertBalanceDelta(lenderBefore, lenderAfterDeposit, `-${depositDrops}`, deposit.evidence.feeDrops);
    const deposited = await vaultState(client, vaultId, deposit.evidence.ledgerIndex);
    if (deposited.assetsAvailableDrops !== depositDrops || BigInt(deposited.outstandingShares) <= 0n) throw new Error('Validated deposit did not produce the expected vault liquidity and shares.');
    const withdraw = await submit(client, { TransactionType: 'VaultWithdraw', Account: lender.address, VaultID: vaultId, Amount: depositDrops }, lender, directory);
    const lenderAfterWithdrawal = await balance(client, lender.address, withdraw.evidence.ledgerIndex);
    assertBalanceDelta(lenderAfterDeposit, lenderAfterWithdrawal, depositDrops, withdraw.evidence.feeDrops);
    const withdrawn = await vaultState(client, vaultId, withdraw.evidence.ledgerIndex);
    if (withdrawn.assetsAvailableDrops !== '0' || withdrawn.assetsTotalDrops !== '0' || withdrawn.outstandingShares !== '0') throw new Error('Vault/share balances did not return to zero after withdrawal.');
    const report = {
      status: 'verified', scope: 'XLS-65 vault creation, deposit and withdrawal only; no loan or yield is demonstrated.',
      completedAt: new Date().toISOString(), network, directory,
      accounts: { owner: owner.address, lender: lender.address }, depositDrops,
      transactions: [create.evidence, deposit.evidence, withdraw.evidence], snapshots: { initial, deposited, withdrawn },
      lenderBalancesDrops: { before: lenderBefore, afterDeposit: lenderAfterDeposit, afterWithdrawal: lenderAfterWithdrawal },
      fullVanillaComplete: false,
    };
    await writePrivateJson(join(directory, 'report.json'), report);
    return report;
  } catch (error) {
    await writePrivateJson(join(directory, 'failure.json'), { status: 'failed', directory, message: error instanceof Error ? error.message : 'Unknown failure', fullVanillaComplete: false });
    throw new Error(`Vault smoke stopped. Inspect local evidence in ${directory}. ${error instanceof Error ? error.message : 'Unknown failure'}`);
  }
}

export function parseFaucetWallet(value: unknown): Wallet {
  const account = record(record(value, 'faucet response').account, 'faucet account');
  if (typeof account.address !== 'string' || typeof account.secret !== 'string') throw new Error('Unexpected faucet account schema: expected address and secret.');
  let wallet: Wallet;
  try { wallet = Wallet.fromSeed(account.secret); }
  catch { throw new Error('Faucet returned an invalid signing seed.'); }
  if (wallet.address !== account.address) throw new Error('Faucet account address does not match its signing seed.');
  return wallet;
}
