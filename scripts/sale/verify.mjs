import fs from 'node:fs/promises'
import xrpl from 'xrpl'

const fixture = JSON.parse(await fs.readFile(new URL('../../demo/fixtures/sale.json', import.meta.url), 'utf8'))
const assert = (ok, message) => { if (!ok) throw new Error(message) }
const client = new xrpl.Client(fixture.network.wss, { connectionTimeout: 10_000 })
const explorer = `${fixture.network.explorer_base}${fixture.batch.hash}`

try {
  await client.connect()
  const result = (await client.request({ command: 'tx', transaction: fixture.batch.hash })).result
  assert(result.validated === true, 'sale transaction is not validated')
  assert(result.ledger_index === fixture.batch.ledger_index, 'validated ledger index mismatch')
  assert(result.tx_json?.TransactionType === 'Batch', 'fixture is not a Batch')
  assert(result.meta?.TransactionResult === 'tesSUCCESS', 'Batch did not validate tesSUCCESS')
  assert((result.tx_json.Flags & 1) === 1, 'tfAllOrNothing is not set')
  const inner = result.tx_json.RawTransactions?.map((entry) => entry.RawTransaction) ?? []
  assert(inner.length === 2 && inner.every((tx) => (tx.Flags & 0x40000000) !== 0), 'expected two inner Batch transactions')
  const buyerPayment = inner.find((tx) => tx.Account === fixture.buyer && tx.Destination === fixture.seller)
  const sellerShares = inner.find((tx) => tx.Account === fixture.seller && tx.Destination === fixture.buyer)
  assert(buyerPayment?.Amount === fixture.sale_price_drops, 'buyer XRP payment mismatch')
  assert(sellerShares?.Amount?.mpt_issuance_id === fixture.share_mpt_id && sellerShares.Amount.value === fixture.share_amount_units, 'seller share payment mismatch')
  assert(result.tx_json.Account === fixture.seller, 'outer fee payer mismatch')
  assert(result.tx_json.Fee === fixture.batch.outer_fee_drops, 'validated Batch fee differs from fixture')

  const sellerXrpDelta = BigInt(fixture.after.seller_xrp_drops) - BigInt(fixture.before.seller_xrp_drops)
  const buyerXrpDelta = BigInt(fixture.after.buyer_xrp_drops) - BigInt(fixture.before.buyer_xrp_drops)
  assert(sellerXrpDelta === BigInt(fixture.sale_price_drops) - BigInt(fixture.batch.outer_fee_drops), 'seller XRP delta/fee mismatch')
  assert(buyerXrpDelta === -BigInt(fixture.sale_price_drops), 'buyer XRP delta mismatch')
  assert(BigInt(fixture.before.seller_share_units) - BigInt(fixture.after.seller_share_units) === BigInt(fixture.share_amount_units), 'seller share delta mismatch')
  assert(BigInt(fixture.after.buyer_share_units) - BigInt(fixture.before.buyer_share_units) === BigInt(fixture.share_amount_units), 'buyer share delta mismatch')
  console.log(JSON.stringify({ verified: true, validated: true, hash: result.hash, ledger_index: result.ledger_index, engine_result: result.meta.TransactionResult, explorer, fee_drops: result.tx_json.Fee, sale_price_drops: fixture.sale_price_drops, share_amount_units: fixture.share_amount_units }, null, 2))
} catch (error) {
  console.error(`SALE_VERIFIER_UNAVAILABLE_OR_FAILED: ${error.message}`)
  process.exitCode = 1
} finally {
  if (client.isConnected()) await client.disconnect()
}
