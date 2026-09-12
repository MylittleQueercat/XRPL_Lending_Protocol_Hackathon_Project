import xrpl from 'xrpl'

// This fixture records validated public ledger evidence only. It contains no
// credentials and deliberately never signs or submits a transaction.
const WSS = 'wss://lending-hackathon.dev.ripplex.io:51233'
const EXPLORER = 'https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/'
const VAULT_ID = '84953AA75CEBE50930F987E969D7918308B7C1471253DB0BD5E55CF3334C66DF'
const SHARE_MPT_ID = '000000016D8E5748CD5FA882BDFF41D6619F430CF479D096'

const evidence = {
  create: { hash: '903AD65787F0537FD300B4641BB7FF43AA29C9DD5099CC331F3F99C78B76C186', ledger: 65180, type: 'VaultCreate' },
  authorize: { hash: 'D114AB7BAB7A9F4997707E73024F591442C0FB27385AFCE497DA1DC707CBB48F', ledger: 65182, type: 'MPTokenAuthorize' },
  deposit: { hash: '95E6D36442EBB9D36550C1D54DB88871B6BD7AE5443C71E4348436AE3D59655D', ledger: 65184, type: 'VaultDeposit' },
  transfer: { hash: '221B4E9EEECAC4AA5AF7FDEA1F97F41614899C24BECDA6B43712ED463D3AC8FD', ledger: 65186, type: 'Payment' },
  withdraw: { hash: '4A35CB34B997E6A6B1E79299960AA40E790E5CA1F320E2DE2228A52AEE6C0AB8', ledger: 65188, type: 'VaultWithdraw' },
}

function explorer(hash) { return `${EXPLORER}${hash}` }
function nodeFields(affected, entryType, account) {
  for (const wrapper of affected) {
    const node = wrapper.ModifiedNode ?? wrapper.CreatedNode ?? wrapper.DeletedNode
    if (node?.LedgerEntryType !== entryType) continue
    const fields = node.FinalFields ?? node.NewFields ?? {}
    if (!account || fields.Account === account) return { previous: node.PreviousFields ?? {}, final: fields }
  }
  return null
}
function tokenFields(affected, account) {
  for (const wrapper of affected) {
    const node = wrapper.ModifiedNode ?? wrapper.CreatedNode ?? wrapper.DeletedNode
    const fields = node?.FinalFields ?? node?.NewFields ?? {}
    if (node?.LedgerEntryType === 'MPToken' && fields.Account === account && fields.MPTokenIssuanceID === SHARE_MPT_ID) {
      return { previous: node.PreviousFields ?? {}, final: fields, deleted: Boolean(wrapper.DeletedNode) }
    }
  }
  return null
}
function assert(condition, message) { if (!condition) throw new Error(message) }

const client = new xrpl.Client(WSS, { connectionTimeout: 10_000 })
await client.connect()
try {
  const transactions = {}
  for (const [name, fixture] of Object.entries(evidence)) {
    const result = (await client.request({ command: 'tx', transaction: fixture.hash })).result
    assert(result.validated === true, `${name} is not validated`)
    assert(result.ledger_index === fixture.ledger, `${name} ledger changed`)
    assert(result.meta?.TransactionResult === 'tesSUCCESS', `${name} did not succeed`)
    assert(result.tx_json?.TransactionType === fixture.type, `${name} transaction type changed`)
    transactions[name] = result
  }

  const create = transactions.create.tx_json
  const deposit = transactions.deposit.tx_json
  const transfer = transactions.transfer.tx_json
  const withdraw = transactions.withdraw.tx_json
  assert(create.Asset?.currency === 'XRP' && create.WithdrawalPolicy === 1 && create.Flags === 0, 'vault configuration mismatch')
  assert(deposit.Account !== create.Account && deposit.VaultID === VAULT_ID && deposit.Amount === '10000000', 'distinct XRP deposit mismatch')
  assert(transfer.DeliverMax?.mpt_issuance_id === SHARE_MPT_ID && transfer.DeliverMax?.value === '1000000', 'share transfer mismatch')
  assert(withdraw.Account === transfer.Destination && withdraw.VaultID === VAULT_ID && withdraw.Amount === '1000000', 'holder redemption mismatch')

  const depositMeta = transactions.deposit.meta.AffectedNodes
  const withdrawMeta = transactions.withdraw.meta.AffectedNodes
  const depositor = deposit.Account
  const holder = withdraw.Account
  const depositAccount = nodeFields(depositMeta, 'AccountRoot', depositor)
  const depositVault = nodeFields(depositMeta, 'Vault')
  const depositToken = tokenFields(depositMeta, depositor)
  const withdrawAccount = nodeFields(withdrawMeta, 'AccountRoot', holder)
  const withdrawVault = nodeFields(withdrawMeta, 'Vault')
  const withdrawToken = tokenFields(withdrawMeta, holder)
  assert(depositAccount && depositVault && depositToken, 'deposit metadata is incomplete')
  assert(withdrawAccount && withdrawVault && withdrawToken, 'withdrawal metadata is incomplete')

  const output = {
    verified_at: new Date().toISOString(),
    network: 'Track 1 custom Devnet (network_id 4001)',
    vault: { id: VAULT_ID, share_mpt_id: SHARE_MPT_ID, asset: create.Asset, withdrawal_policy: create.WithdrawalPolicy, flags: create.Flags },
    transactions: Object.fromEntries(Object.entries(transactions).map(([name, result]) => [name, {
      hash: result.hash, ledger_index: result.ledger_index, engine_result: result.meta.TransactionResult,
      fee_drops: result.tx_json.Fee, explorer: explorer(result.hash),
    }])),
    deposit_observation: {
      depositor, xrp_drops_before: depositAccount.previous.Balance, xrp_drops_after: depositAccount.final.Balance,
      deposited_xrp_drops: deposit.Amount, issued_share_units: depositToken.final.MPTAmount,
      vault_liquidity_drops_before: depositVault.previous.AssetsAvailable ?? '0', vault_liquidity_drops_after: depositVault.final.AssetsAvailable,
    },
    withdrawal_observation: {
      holder, xrp_drops_before: withdrawAccount.previous.Balance, xrp_drops_after: withdrawAccount.final.Balance,
      redeemed_xrp_drops: withdraw.Amount, fee_drops: withdraw.Fee,
      share_units_before: withdrawToken.previous.MPTAmount, share_holding_deleted: withdrawToken.deleted,
      vault_liquidity_drops_before: withdrawVault.previous.AssetsAvailable, vault_liquidity_drops_after: withdrawVault.final.AssetsAvailable,
    },
  }
  console.log(JSON.stringify(output, null, 2))
} finally {
  await client.disconnect()
}
