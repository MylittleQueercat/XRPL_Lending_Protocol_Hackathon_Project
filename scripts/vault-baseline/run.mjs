import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import xrpl from 'xrpl'

// Fresh, disposable Track 1 proof runner. It creates only the vault baseline
// (create, lender deposit, share transfer, holder withdrawal), never logs a
// seed, and writes any seeds to the ignored, owner-only wallets.json file.
const WSS = 'wss://lending-hackathon.dev.ripplex.io:51233'
const FAUCET = 'https://lending-hackathon-faucet.dev.ripplex.io/accounts'
const EXPLORER = 'https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/'
const walletsFile = new URL('./wallets.json', import.meta.url)
const resultsFile = new URL('./fresh-results.json', import.meta.url)

function explorer(hash) { return `${EXPLORER}${hash}` }
function assert(condition, message) { if (!condition) throw new Error(message) }
async function xrpBalance(client, address) {
  try { return await client.getXrpBalance(address) } catch { return '0' }
}
async function shareHolding(client, address, issuanceID) {
  const response = await client.request({ command: 'account_objects', account: address, ledger_index: 'validated', type: 'mptoken' })
  const entry = response.result.account_objects.find((object) => object.MPTokenIssuanceID === issuanceID)
  return entry ? entry.MPTAmount : '0'
}
async function vault(client, vaultID) {
  return (await client.request({ command: 'ledger_entry', ledger_index: 'validated', index: vaultID })).result.node
}
async function loadWallets() {
  if (existsSync(walletsFile)) {
    const saved = JSON.parse(await fs.readFile(walletsFile, 'utf8'))
    return Object.fromEntries(Object.entries(saved).map(([role, seed]) => [role, xrpl.Wallet.fromSeed(seed)]))
  }
  const wallets = Object.fromEntries(['owner', 'lender', 'holder'].map((role) => [role, xrpl.Wallet.generate()]))
  await fs.writeFile(walletsFile, JSON.stringify(Object.fromEntries(Object.entries(wallets).map(([role, wallet]) => [role, wallet.seed])), null, 2), { mode: 0o600 })
  return wallets
}
async function fund(client, wallet) {
  if (Number(await xrpBalance(client, wallet.classicAddress)) > 20) return wallet
  const response = await fetch(FAUCET, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ destination: wallet.classicAddress, xrpAmount: '100', userAgent: 'vault-baseline' }),
  })
  if (!response.ok) throw new Error(`faucet HTTP ${response.status}`)
  const funded = (await response.json()).account
  const result = funded?.secret ? xrpl.Wallet.fromSeed(funded.secret) : wallet
  assert(result.classicAddress === funded?.address, 'faucet returned mismatched account')
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (Number(await xrpBalance(client, result.classicAddress)) > 20) return result
    await new Promise((resolve) => setTimeout(resolve, 1_000))
  }
  throw new Error('faucet funding did not validate')
}
async function submit(client, tx, wallet) {
  const result = (await client.submitAndWait(tx, { wallet, failHard: true })).result
  assert(result.meta?.TransactionResult === 'tesSUCCESS', `${tx.TransactionType}: ${result.meta?.TransactionResult}`)
  return { hash: result.hash, ledger_index: result.ledger_index, engine_result: result.meta.TransactionResult, fee_drops: result.tx_json.Fee, explorer: explorer(result.hash) }
}

const client = new xrpl.Client(WSS, { connectionTimeout: 10_000 })
await client.connect()
try {
  let wallets = await loadWallets()
  for (const role of Object.keys(wallets)) wallets[role] = await fund(client, wallets[role])
  const addresses = Object.fromEntries(Object.entries(wallets).map(([role, wallet]) => [role, wallet.classicAddress]))

  const created = await submit(client, { TransactionType: 'VaultCreate', Account: addresses.owner, Asset: { currency: 'XRP' }, WithdrawalPolicy: 1, Flags: 0 }, wallets.owner)
  const createTx = (await client.request({ command: 'tx', transaction: created.hash })).result.tx_json
  const vaultID = xrpl.hashes.hashVault(addresses.owner, createTx.Sequence)
  const shareMPTID = (await vault(client, vaultID)).ShareMPTID
  const authorized = await submit(client, { TransactionType: 'MPTokenAuthorize', Account: addresses.holder, MPTokenIssuanceID: shareMPTID }, wallets.holder)

  const depositBefore = { xrp_drops: xrpl.xrpToDrops(await xrpBalance(client, addresses.lender)), shares: await shareHolding(client, addresses.lender, shareMPTID), vault_liquidity_drops: (await vault(client, vaultID)).AssetsAvailable ?? '0' }
  const deposited = await submit(client, { TransactionType: 'VaultDeposit', Account: addresses.lender, VaultID: vaultID, Amount: '10000000' }, wallets.lender)
  const depositAfter = { xrp_drops: xrpl.xrpToDrops(await xrpBalance(client, addresses.lender)), shares: await shareHolding(client, addresses.lender, shareMPTID), vault_liquidity_drops: (await vault(client, vaultID)).AssetsAvailable }
  assert(depositAfter.shares === '10000000', 'unexpected initial share mint; inspect fresh-results.json')

  const transferred = await submit(client, { TransactionType: 'Payment', Account: addresses.lender, Destination: addresses.holder, Amount: { mpt_issuance_id: shareMPTID, value: '1000000' } }, wallets.lender)
  const withdrawBefore = { xrp_drops: xrpl.xrpToDrops(await xrpBalance(client, addresses.holder)), shares: await shareHolding(client, addresses.holder, shareMPTID), vault_liquidity_drops: (await vault(client, vaultID)).AssetsAvailable }
  const withdrawn = await submit(client, { TransactionType: 'VaultWithdraw', Account: addresses.holder, VaultID: vaultID, Amount: '1000000' }, wallets.holder)
  const withdrawAfter = { xrp_drops: xrpl.xrpToDrops(await xrpBalance(client, addresses.holder)), shares: await shareHolding(client, addresses.holder, shareMPTID), vault_liquidity_drops: (await vault(client, vaultID)).AssetsAvailable }

  const output = { network: 'Track 1 custom Devnet (network_id 4001)', addresses, vault: { id: vaultID, share_mpt_id: shareMPTID, asset: 'XRP', withdrawal_policy: 1, flags: 0 }, transactions: { create: created, authorize: authorized, deposit: deposited, transfer: transferred, withdraw: withdrawn }, deposit: { before: depositBefore, after: depositAfter }, withdrawal: { before: withdrawBefore, after: withdrawAfter } }
  await fs.writeFile(resultsFile, JSON.stringify(output, null, 2))
  console.log(JSON.stringify(output, null, 2))
} finally {
  await client.disconnect()
}
