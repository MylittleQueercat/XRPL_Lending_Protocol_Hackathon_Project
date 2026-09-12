import xrpl from 'xrpl'

// Validated public ledger fixture only. This verifier never signs, submits,
// creates accounts, or reads wallet files.
const WSS = 'wss://lending-hackathon.dev.ripplex.io:51233'
const EXPLORER = 'https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/'
const VAULT_ID = '84953AA75CEBE50930F987E969D7918308B7C1471253DB0BD5E55CF3334C66DF'
const BROKER_ID = '1143BB37017D3373A2E72F39D59C6A9DC6F63FB7392CF4C40B1B634E99F7E62A'
const OPERATOR = 'rNBD9Fr2DirsjToHkpQcicpqx4wf9hz3uB'
const evidence = {
  set: { hash: '0C263EB01C5C0D72F58A0AD0095CF6D0C04E78608CAF827024538084F821C2C8', ledger: 66593, type: 'LoanBrokerSet' },
  cover_deposit: { hash: 'C7EC8535ED48573624286775E7FDDE170E8E880A879D77F48269923485242838', ledger: 66601, type: 'LoanBrokerCoverDeposit' },
}

function assert(condition, message) { if (!condition) throw new Error(message) }
function explorer(hash) { return `${EXPLORER}${hash}` }
function fields(affected, type, account) {
  for (const wrapper of affected) {
    const node = wrapper.CreatedNode ?? wrapper.ModifiedNode ?? wrapper.DeletedNode
    const final = node?.FinalFields ?? node?.NewFields ?? {}
    if (node?.LedgerEntryType === type && (!account || final.Account === account)) return { previous: node.PreviousFields ?? {}, final }
  }
  return null
}

const client = new xrpl.Client(WSS, { connectionTimeout: 10_000 })
await client.connect()
try {
  const transactions = {}
  for (const [name, fixture] of Object.entries(evidence)) {
    const result = (await client.request({ command: 'tx', transaction: fixture.hash })).result
    assert(result.validated === true, `${name} is not validated`)
    assert(result.ledger_index === fixture.ledger, `${name} ledger mismatch`)
    assert(result.meta?.TransactionResult === 'tesSUCCESS', `${name} failed`)
    assert(result.tx_json?.TransactionType === fixture.type, `${name} transaction type mismatch`)
    transactions[name] = result
  }

  const set = transactions.set.tx_json
  const deposit = transactions.cover_deposit.tx_json
  assert(set.Account === OPERATOR && set.VaultID === VAULT_ID, 'broker was not set by this vault owner')
  assert(set.ManagementFeeRate === 1000 && set.DebtMaximum === '9000000', 'broker lending parameters mismatch')
  assert(set.CoverRateMinimum === 10000 && set.CoverRateLiquidation === 10000, 'broker cover parameters mismatch')
  assert(deposit.Account === OPERATOR && deposit.LoanBrokerID === BROKER_ID && deposit.Amount === '1000000', 'cover deposit mismatch')

  const broker = (await client.request({ command: 'ledger_entry', ledger_index: 'validated', index: BROKER_ID })).result.node
  assert(broker.LedgerEntryType === 'LoanBroker' && broker.VaultID === VAULT_ID && broker.Owner === OPERATOR, 'live broker attachment mismatch')
  assert(broker.CoverAvailable === '1000000', 'live cover amount mismatch')
  const pseudoXrp = xrpl.xrpToDrops(await client.getXrpBalance(broker.Account))
  assert(pseudoXrp === '1000000', 'broker pseudo-account balance mismatch')

  const coverMeta = transactions.cover_deposit.meta.AffectedNodes
  const operator = fields(coverMeta, 'AccountRoot', OPERATOR)
  const coverBroker = fields(coverMeta, 'LoanBroker')
  const pseudo = fields(coverMeta, 'AccountRoot', broker.Account)
  assert(operator && coverBroker && pseudo, 'cover transaction metadata is incomplete')
  const output = {
    verified_at: new Date().toISOString(),
    network: 'Track 1 custom Devnet (network_id 4001)',
    vault_id: VAULT_ID,
    broker: {
      id: BROKER_ID, pseudo_account: broker.Account, owner: broker.Owner, debt_maximum_drops: broker.DebtMaximum,
      management_fee_rate: broker.ManagementFeeRate, cover_rate_minimum: broker.CoverRateMinimum,
      cover_rate_liquidation: broker.CoverRateLiquidation, cover_available_drops: broker.CoverAvailable,
    },
    transactions: Object.fromEntries(Object.entries(transactions).map(([name, result]) => [name, {
      hash: result.hash, ledger_index: result.ledger_index, engine_result: result.meta.TransactionResult,
      fee_drops: result.tx_json.Fee, explorer: explorer(result.hash),
    }])),
    cover_deposit_observation: {
      operator_xrp_drops_before: operator.previous.Balance, operator_xrp_drops_after: operator.final.Balance,
      cover_available_before: coverBroker.previous.CoverAvailable ?? '0', cover_available_after: coverBroker.final.CoverAvailable,
      broker_pseudo_xrp_before: pseudo.previous.Balance ?? '0', broker_pseudo_xrp_after: pseudo.final.Balance,
      deposit_drops: deposit.Amount, fee_drops: deposit.Fee,
    },
  }
  console.log(JSON.stringify(output, null, 2))
} finally {
  await client.disconnect()
}
