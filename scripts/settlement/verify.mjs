import xrpl from 'xrpl'

const WSS = 'wss://lending-hackathon.dev.ripplex.io:51233'
const EXPLORER = 'https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/'
const fixtures = {
  success: { hash: '4D4686EA12DAD06318E95AC8537DA3975D63A0E04204809884570F195BF8D0F9', ledger: 65192 },
  failure: { hash: 'EC8802E7B6681977021E1778C6ABF89CDCBBA238031A4B01FCC237BB11918813', ledger: 65194 },
}
const client = new xrpl.Client(WSS, { connectionTimeout: 10_000 })
const assert = (ok, message) => { if (!ok) throw new Error(message) }
await client.connect()
try {
  const out = {}
  for (const [name, fixture] of Object.entries(fixtures)) {
    const tx = (await client.request({ command: 'tx', transaction: fixture.hash })).result
    assert(tx.validated === true && tx.ledger_index === fixture.ledger, `${name}: not validated at expected ledger`)
    assert(tx.tx_json?.TransactionType === 'Batch' && tx.meta?.TransactionResult === 'tesSUCCESS', `${name}: Batch/result mismatch`)
    assert((tx.tx_json.Flags & 0x1) === 0x1, `${name}: tfAllOrNothing missing`)
    assert(Array.isArray(tx.tx_json.RawTransactions) && tx.tx_json.RawTransactions.length === 2, `${name}: expected two inner legs`)
    assert(tx.tx_json.RawTransactions.every((x) => x.RawTransaction?.Flags === 0x40000000), `${name}: inner batch flag missing`)
    out[name] = { hash: tx.hash, validated_ledger: tx.ledger_index, engine_result: tx.meta.TransactionResult, fee_drops: tx.tx_json.Fee, outer_account: tx.tx_json.Account, inner_accounts: tx.tx_json.RawTransactions.map((x) => x.RawTransaction.Account), explorer: `${EXPLORER}${tx.hash}` }
  }
  console.log(JSON.stringify({ verified_at: new Date().toISOString(), network: 'Track 1 custom Devnet (network_id 4001)', sdk: 'xrpl.js 5.2.0', fixtures: out, state_evidence: 'See scripts/raise-feasibility/RESULTS.md for sanitized before/after balances and rollback assertions.' }, null, 2))
} finally { await client.disconnect() }
