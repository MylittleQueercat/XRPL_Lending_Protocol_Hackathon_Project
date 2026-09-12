import xrpl from 'xrpl'

// Public validated evidence only: no wallets, credentials, signing, or writes.
const WSS = 'wss://lending-hackathon.dev.ripplex.io:51233'
const EXPLORER = 'https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/'
const VAULT_ID = '84953AA75CEBE50930F987E969D7918308B7C1471253DB0BD5E55CF3334C66DF'
const SHARE_MPT_ID = '000000016D8E5748CD5FA882BDFF41D6619F430CF479D096'
const AMOUNT = '100000'
const SELLER = 'rnMVLLvtwCmPskAHfbGVoJfr5Tz6exBkDy'
const BUYER = 'rJxBw6iDvRdMxJsLdSKUgvDpe9chDrercH'
const evidence = {
  seller_opt_in: { hash: '41D60AEDC31954763739453AD37BFC3C477DF0EAA8BCDB1F9861132E5755A7B5', ledger: 66980, type: 'MPTokenAuthorize', result: 'tesSUCCESS' },
  allocation: { hash: '57A197B6FEBB91CF8AA477B03E76A41BB19ECB66702B7A4AF3B694C3E4EE9F0A', ledger: 66981, type: 'Payment', result: 'tesSUCCESS' },
  unopted_delivery: { hash: 'EC138DB092331B8BE2613213A6E4DDD1EBFBAD3088130EA47428026C92026A27', ledger: 66983, type: 'Payment', result: 'tecNO_AUTH' },
  buyer_opt_in: { hash: 'AC3B4A829C5455CAE5EC69EE91E0E12B5257F0388F135B9D658F5326AA812044', ledger: 66985, type: 'MPTokenAuthorize', result: 'tesSUCCESS' },
  transfer: { hash: '84C763C94911014BA93C3A80E2C3991463A2294B3CB56CA73CC91CDC60282350', ledger: 66987, type: 'Payment', result: 'tesSUCCESS' },
  former_holder_withdraw: { hash: '197FA71655629C18351C7543DEF958E838B890E9BEC534F841D5C24C5F00B82D', ledger: 66989, type: 'VaultWithdraw', result: 'tecINSUFFICIENT_FUNDS' },
  buyer_withdraw: { hash: 'A36C0044D4CF5F5A346C1EFF5F7134E10D0E148A8B08DE3BE51BDCE9F00F5599', ledger: 66991, type: 'VaultWithdraw', result: 'tesSUCCESS' },
}

function assert(condition, message) { if (!condition) throw new Error(message) }
function explorer(hash) { return `${EXPLORER}${hash}` }
function fields(affected, entryType, account) {
  for (const wrapper of affected) {
    const node = wrapper.CreatedNode ?? wrapper.ModifiedNode ?? wrapper.DeletedNode
    const final = node?.FinalFields ?? node?.NewFields ?? {}
    if (node?.LedgerEntryType === entryType && (!account || final.Account === account)) {
      return { previous: node.PreviousFields ?? {}, final, deleted: Boolean(wrapper.DeletedNode) }
    }
  }
  return null
}
function mpt(affected, account) {
  const result = fields(affected, 'MPToken', account)
  return result?.final.MPTokenIssuanceID === SHARE_MPT_ID ? result : null
}

const client = new xrpl.Client(WSS, { connectionTimeout: 10_000 })
await client.connect()
try {
  const transactions = {}
  for (const [name, fixture] of Object.entries(evidence)) {
    const result = (await client.request({ command: 'tx', transaction: fixture.hash })).result
    assert(result.validated === true, `${name} is not validated`)
    assert(result.ledger_index === fixture.ledger, `${name} ledger mismatch`)
    assert(result.tx_json?.TransactionType === fixture.type, `${name} type mismatch`)
    assert(result.meta?.TransactionResult === fixture.result, `${name} result mismatch`)
    transactions[name] = result
  }

  const issuance = (await client.request({ command: 'ledger_entry', ledger_index: 'validated', mpt_issuance: SHARE_MPT_ID })).result.node
  const vault = (await client.request({ command: 'ledger_entry', ledger_index: 'validated', index: VAULT_ID })).result.node
  assert(issuance.Flags === 56 && issuance.Issuer === vault.Account && vault.ShareMPTID === SHARE_MPT_ID, 'live share-MPT definition mismatch')

  const unopted = transactions.unopted_delivery
  const transfer = transactions.transfer
  const former = transactions.former_holder_withdraw
  const redeemed = transactions.buyer_withdraw
  assert(unopted.tx_json.Account === SELLER && unopted.tx_json.Destination === BUYER && unopted.tx_json.DeliverMax?.value === AMOUNT, 'unopted delivery mismatch')
  assert(mpt(unopted.meta.AffectedNodes, SELLER) === null && mpt(unopted.meta.AffectedNodes, BUYER) === null, 'unopted delivery changed share ownership')
  assert(transactions.buyer_opt_in.tx_json.Account === BUYER && transactions.buyer_opt_in.tx_json.MPTokenIssuanceID === SHARE_MPT_ID, 'buyer opt-in mismatch')
  const sellerTransfer = mpt(transfer.meta.AffectedNodes, SELLER)
  const buyerTransfer = mpt(transfer.meta.AffectedNodes, BUYER)
  assert(sellerTransfer?.previous.MPTAmount === AMOUNT && sellerTransfer.final.MPTAmount === undefined && buyerTransfer?.final.MPTAmount === AMOUNT, 'full bounded transfer ownership mismatch')
  assert(former.tx_json.Account === SELLER && former.tx_json.Amount === AMOUNT, 'former holder withdrawal mismatch')
  assert(mpt(former.meta.AffectedNodes, SELLER) === null && fields(former.meta.AffectedNodes, 'Vault') === null, 'former holder rejection changed shares or vault liquidity')
  const buyerWithdraw = mpt(redeemed.meta.AffectedNodes, BUYER)
  const buyerAccount = fields(redeemed.meta.AffectedNodes, 'AccountRoot', BUYER)
  const withdrawalVault = fields(redeemed.meta.AffectedNodes, 'Vault')
  assert(buyerWithdraw?.deleted && buyerWithdraw.previous.MPTAmount === AMOUNT, 'buyer did not redeem transferred shares')
  assert(buyerAccount && withdrawalVault && withdrawalVault.previous.AssetsAvailable === '9000000' && withdrawalVault.final.AssetsAvailable === '8900000', 'buyer withdrawal balance mismatch')

  console.log(JSON.stringify({
    verified_at: new Date().toISOString(), network: 'Track 1 custom Devnet (network_id 4001)',
    share_mpt: { id: SHARE_MPT_ID, issuer: issuance.Issuer, flags: issuance.Flags, require_issuer_auth: false, can_trade: true, can_transfer: true },
    vault_id: VAULT_ID,
    transactions: Object.fromEntries(Object.entries(transactions).map(([name, result]) => [name, { hash: result.hash, ledger_index: result.ledger_index, engine_result: result.meta.TransactionResult, fee_drops: result.tx_json.Fee, explorer: explorer(result.hash) }])),
    bounded_transfer: { seller: SELLER, buyer: BUYER, amount_units: AMOUNT, seller_shares_before: sellerTransfer.previous.MPTAmount, seller_shares_after: '0 (MPTAmount absent)', buyer_shares_before: '0', buyer_shares_after: buyerTransfer.final.MPTAmount, fee_drops: transfer.tx_json.Fee },
    unopted_delivery: { engine_result: unopted.meta.TransactionResult, seller_shares_unchanged: AMOUNT, buyer_shares_unchanged: '0', fee_drops: unopted.tx_json.Fee },
    former_holder_rejection: { engine_result: former.meta.TransactionResult, seller_shares: '0', vault_liquidity_unchanged_drops: '9000000', fee_drops: former.tx_json.Fee },
    new_holder_redemption: { buyer_shares_before: buyerWithdraw.previous.MPTAmount, buyer_shares_after: '0 (holding deleted)', buyer_xrp_before: buyerAccount.previous.Balance, buyer_xrp_after: buyerAccount.final.Balance, fee_drops: redeemed.tx_json.Fee, vault_liquidity_before: withdrawalVault.previous.AssetsAvailable, vault_liquidity_after: withdrawalVault.final.AssetsAvailable },
  }, null, 2))
} finally {
  await client.disconnect()
}
