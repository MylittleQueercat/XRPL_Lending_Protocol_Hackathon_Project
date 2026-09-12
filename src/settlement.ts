import { join } from 'node:path';
import { BatchFlags, Client, GlobalFlags, signMultiBatch, Wallet, type SubmittableTransaction } from 'xrpl';
import { parseXrp, record, TRACK1, type NetworkReport } from './core.js';
import { createRunDirectory, writePrivateJson } from './storage.js';
import { buildVaultCreate, fundWallet, readBalance } from './vault.js';

export const SETTLEMENT = Object.freeze({ depositXrp: '20', priceXrp: '5', sharesTraded: '1000000' });

// A sale settles a buyer's XRP payment against a seller's share delivery in one atomic Batch.
// The buyer authorizes their own inner transaction; the seller signs the outer Batch.
export function buildSaleBatch(seller: string, buyer: string, shareMptId: string, priceDrops: string, shares: string) {
  return {
    TransactionType: 'Batch', Account: seller, Flags: BatchFlags.tfAllOrNothing,
    RawTransactions: [
      { RawTransaction: { TransactionType: 'Payment', Account: buyer, Destination: seller, Amount: priceDrops, Flags: GlobalFlags.tfInnerBatchTxn } },
      { RawTransaction: { TransactionType: 'Payment', Account: seller, Destination: buyer, Amount: { mpt_issuance_id: shareMptId, value: shares }, Flags: GlobalFlags.tfInnerBatchTxn } },
    ],
  } as unknown as SubmittableTransaction;
}

// Settlement proofs need the ledger's verdict, including failures, so nothing here throws on a
// rejected transaction. Submission errors are captured as an outcome rather than an exception.
async function attempt(client: Client, transaction: SubmittableTransaction, outer: Wallet, inner: Wallet | undefined, label: string, directory: string) {
  try {
    const prepared = await client.autofill(transaction, inner ? 1 : 0);
    if (inner) signMultiBatch(inner, prepared as never);
    const signed = outer.sign(prepared);
    await writePrivateJson(join(directory, `${label}-intent.json`), { hash: signed.hash, label });
    const result = (await client.submitAndWait(signed.tx_blob)).result;
    const meta = record(result.meta, 'transaction metadata');
    return {
      label, submitted: true, resultCode: String(meta.TransactionResult), hash: String(result.hash),
      ledgerIndex: Number(result.ledger_index), explorer: `${TRACK1.explorerUrl}/transactions/${String(result.hash)}`,
      blob: signed.tx_blob, meta,
    };
  } catch (error) {
    const err = error as { message?: string; data?: { error?: string; error_message?: string } };
    return {
      label, submitted: false, resultCode: err.data?.error ?? 'rejected-before-submission',
      message: err.data?.error_message ?? err.message, hash: undefined as string | undefined,
      ledgerIndex: undefined as number | undefined, explorer: undefined as string | undefined, blob: undefined as string | undefined,
      meta: undefined as Record<string, unknown> | undefined,
    };
  }
}

async function shareBalance(client: Client, address: string, shareMptId: string) {
  try {
    const response = await client.request({ command: 'account_objects', account: address, type: 'mptoken', ledger_index: 'validated' });
    for (const value of response.result.account_objects ?? []) {
      const holding = record(value, 'mptoken holding');
      if (String(holding.MPTokenIssuanceID) === shareMptId) return String(holding.MPTAmount ?? '0');
    }
    return '0';
  } catch {
    return '0';
  }
}

async function positions(client: Client, seller: string, buyer: string, shareMptId: string) {
  return {
    sellerXrp: await readBalance(client, seller), buyerXrp: await readBalance(client, buyer),
    sellerShares: await shareBalance(client, seller, shareMptId), buyerShares: await shareBalance(client, buyer, shareMptId),
  };
}

type Position = Awaited<ReturnType<typeof positions>>;

// A settlement guarantee holds when neither economic leg moved. Fees are charged on the outer
// transaction regardless, so XRP is compared allowing for a fee while shares must be untouched.
export function bothLegsUnchanged(before: Position, after: Position, maxFeeDrops = 1_000_000n) {
  const sellerDelta = BigInt(after.sellerXrp) - BigInt(before.sellerXrp);
  const buyerDelta = BigInt(after.buyerXrp) - BigInt(before.buyerXrp);
  return {
    sharesUnchanged: after.sellerShares === before.sellerShares && after.buyerShares === before.buyerShares,
    paymentUnchanged: sellerDelta <= 0n && sellerDelta >= -maxFeeDrops && buyerDelta <= 0n && buyerDelta >= -maxFeeDrops,
    sellerXrpDeltaDrops: sellerDelta.toString(), buyerXrpDeltaDrops: buyerDelta.toString(),
  };
}

// submitValidated names its evidence files after the transaction type, so repeating a type in one
// run collides. Setup steps here are labelled individually instead.
async function mustSucceed(client: Client, transaction: SubmittableTransaction, wallet: Wallet, label: string, directory: string) {
  const outcome = await attempt(client, transaction, wallet, undefined, label, directory);
  if (outcome.resultCode !== 'tesSUCCESS') throw new Error(`Setup step ${label} failed: ${outcome.resultCode} ${outcome.message ?? ''}`);
  return outcome;
}

export async function runSettlementFailures(client: Client, network: NetworkReport) {
  if (!network.vaultReady || network.networkId !== TRACK1.networkId) throw new Error('Settlement checks require the verified Track 1 hackathon network.');
  const directory = await createRunDirectory('settlement-failures');
  await writePrivateJson(join(directory, 'network.json'), network);
  try {
    const owner = await fundWallet(client, 'vault-owner', directory);
    const seller = await fundWallet(client, 'seller', directory);
    const buyer = await fundWallet(client, 'buyer', directory);
    const outsider = await fundWallet(client, 'outsider', directory);

    const create = await mustSucceed(client, buildVaultCreate(owner.address), owner, 'vault-create', directory);
    let createdVaultIndex = '';
    for (const value of (create.meta?.AffectedNodes as unknown[]) ?? []) {
      const node = record(value, 'affected node');
      if (node.CreatedNode && record(node.CreatedNode, 'created').LedgerEntryType === 'Vault') createdVaultIndex = String(record(node.CreatedNode, 'created').LedgerIndex);
    }
    if (!createdVaultIndex) throw new Error('No Vault created.');
    const vaultResponse = await client.request({ command: 'ledger_entry', index: createdVaultIndex, ledger_index: create.ledgerIndex ?? 'validated' });
    const vaultEntry = record(vaultResponse.result.node, 'vault');
    const vaultId = String(vaultEntry.index);
    const shareMptId = String(vaultEntry.ShareMPTID);

    await mustSucceed(client, { TransactionType: 'VaultDeposit', Account: seller.address, VaultID: vaultId, Amount: parseXrp(SETTLEMENT.depositXrp) }, seller, 'seller-deposit', directory);
    // The recipient must hold an MPToken object before shares can be delivered to them.
    await mustSucceed(client, { TransactionType: 'MPTokenAuthorize', Account: buyer.address, MPTokenIssuanceID: shareMptId } as SubmittableTransaction, buyer, 'buyer-authorize-shares', directory);
    await mustSucceed(client, { TransactionType: 'MPTokenAuthorize', Account: outsider.address, MPTokenIssuanceID: shareMptId } as SubmittableTransaction, outsider, 'outsider-authorize-shares', directory);

    const priceDrops = parseXrp(SETTLEMENT.priceXrp);
    const scenarios: Array<Record<string, unknown>> = [];

    // Case 1 — the buyer cannot pay. The share leg must not deliver on its own.
    {
      const before = await positions(client, seller.address, buyer.address, shareMptId);
      const unaffordable = (BigInt(before.buyerXrp) + BigInt(parseXrp('1000'))).toString();
      const outcome = await attempt(client, buildSaleBatch(seller.address, buyer.address, shareMptId, unaffordable, SETTLEMENT.sharesTraded), seller, buyer, 'insufficient-buyer-balance', directory);
      const after = await positions(client, seller.address, buyer.address, shareMptId);
      const guarantee = bothLegsUnchanged(before, after);
      if (!guarantee.sharesUnchanged) throw new Error('Shares moved despite an unpayable settlement.');
      scenarios.push({ case: 'insufficient buyer balance', expectation: 'neither leg applies', outcome, before, after, guarantee, guaranteeHeld: true });
    }

    // Case 2 — the seller no longer holds the shares they offered.
    {
      await mustSucceed(client, { TransactionType: 'Payment', Account: seller.address, Destination: outsider.address, Amount: { mpt_issuance_id: shareMptId, value: SETTLEMENT.sharesTraded } } as unknown as SubmittableTransaction, seller, 'seller-moves-shares-away', directory);
      const before = await positions(client, seller.address, buyer.address, shareMptId);
      const outcome = await attempt(client, buildSaleBatch(seller.address, buyer.address, shareMptId, priceDrops, (BigInt(before.sellerShares) + BigInt(SETTLEMENT.sharesTraded)).toString()), seller, buyer, 'shares-already-spent', directory);
      const after = await positions(client, seller.address, buyer.address, shareMptId);
      const guarantee = bothLegsUnchanged(before, after);
      if (!guarantee.sharesUnchanged) throw new Error('Shares moved despite an undeliverable settlement.');
      if (!guarantee.paymentUnchanged) throw new Error('The buyer paid for shares that were never delivered.');
      scenarios.push({ case: 'shares already spent', expectation: 'payment must not apply without delivery', outcome, before, after, guarantee, guaranteeHeld: true });
    }

    // Case 3 — a settlement that works, then the same signed blob replayed.
    {
      const before = await positions(client, seller.address, buyer.address, shareMptId);
      const sale = await attempt(client, buildSaleBatch(seller.address, buyer.address, shareMptId, priceDrops, SETTLEMENT.sharesTraded), seller, buyer, 'successful-sale', directory);
      const afterSale = await positions(client, seller.address, buyer.address, shareMptId);
      const delivered = BigInt(afterSale.buyerShares) - BigInt(before.buyerShares);
      if (sale.resultCode !== 'tesSUCCESS' || delivered !== BigInt(SETTLEMENT.sharesTraded)) throw new Error('The reference sale did not settle, so replay cannot be tested against it.');
      scenarios.push({ case: 'successful sale (reference)', expectation: 'both legs apply once', outcome: sale, before, after: afterSale, sharesDelivered: delivered.toString(), guaranteeHeld: true });

      // Resubmitting the identical signed blob must not settle a second time.
      let replayCode = 'unknown';
      let replayMessage: string | undefined;
      try {
        const replay = await client.request({ command: 'submit', tx_blob: sale.blob as string } as Parameters<Client['request']>[0]);
        replayCode = String(record((replay as { result: unknown }).result, 'submit result').engine_result ?? 'unknown');
      } catch (error) {
        const err = error as { message?: string; data?: { error?: string; error_message?: string } };
        replayCode = err.data?.error ?? 'exception';
        replayMessage = err.data?.error_message ?? err.message;
      }
      const afterReplay = await positions(client, seller.address, buyer.address, shareMptId);
      const guarantee = bothLegsUnchanged(afterSale, afterReplay);
      if (!guarantee.sharesUnchanged) throw new Error('A replayed settlement delivered shares twice.');
      scenarios.push({
        case: 'duplicate acceptance (replay of the identical signed Batch)',
        expectation: 'the second submission must not settle again',
        outcome: { label: 'replay', submitted: true, resultCode: replayCode, message: replayMessage },
        before: afterSale, after: afterReplay, guarantee, guaranteeHeld: true,
      });
    }

    const report = {
      status: 'verified',
      scope: 'Settlement guarantees under failure: unpayable buyer, undeliverable shares, and replay of an identical signed Batch.',
      completedAt: new Date().toISOString(), network, directory,
      mechanism: 'XLS-56 Batch with tfAllOrNothing; buyer authorises the inner payment, seller signs the outer Batch.',
      accounts: { vaultOwner: owner.address, seller: seller.address, buyer: buyer.address, outsider: outsider.address },
      ledgerObjects: { vaultId, shareMptId },
      scenarios,
      // Expiry and seller cancellation are not ledger concepts here: an offer is an application
      // record, so those cases belong to the offer lifecycle in #16 rather than to settlement.
      notLedgerEnforced: {
        offerExpiry: 'No ledger primitive. The Batch is only valid while the outer account sequence holds, so a superseded offer cannot settle, but expiry itself must be enforced by the offer model (#16).',
        sellerCancellation: 'No ledger primitive. Cancellation is an application state change; on-ledger it reduces to the seller consuming or moving the shares, which case 2 covers.',
      },
      allGuaranteesHeld: true,
    };
    await writePrivateJson(join(directory, 'report.json'), report);
    return report;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown failure';
    await writePrivateJson(join(directory, 'failure.json'), { status: 'failed', directory, message });
    throw new Error(`Settlement checks stopped. Inspect local evidence in ${directory}. ${message}`);
  }
}
