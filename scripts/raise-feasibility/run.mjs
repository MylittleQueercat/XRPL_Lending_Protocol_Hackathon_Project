import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import xrpl from 'xrpl'

const {
  BatchFlags,
  Client,
  GlobalFlags,
  Wallet,
  hashes,
  signMultiBatch,
  xrpToDrops,
} = xrpl

const RPC = 'https://lending-hackathon.dev.ripplex.io:51234'
const WSS = 'wss://lending-hackathon.dev.ripplex.io:51233'
const EXPLORER = 'https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/'
const FAUCET = 'lending-hackathon-faucet.dev.ripplex.io'
const FAUCET_PATH = '/accounts'
const WALLETS = new URL('./wallets.json', import.meta.url)
const RESULTS = new URL('./RESULTS.md', import.meta.url)

const publicRun = {
  sdk: 'xrpl.js 5.2.0',
  network: {},
  accounts: {},
  operations: [],
  notes: [],
}

function explorer(hash) {
  return `${EXPLORER}transactions/${hash}`
}

async function loadWallets() {
  if (existsSync(WALLETS)) {
    const saved = JSON.parse(await fs.readFile(WALLETS, 'utf8'))
    return Object.fromEntries(Object.entries(saved).map(([role, seed]) => [role, Wallet.fromSeed(seed)]))
  }
  const wallets = Object.fromEntries(['vaultOwner', 'alice', 'bob', 'borrower'].map((role) => [role, Wallet.generate()]))
  await fs.writeFile(WALLETS, JSON.stringify(Object.fromEntries(Object.entries(wallets).map(([role, wallet]) => [role, wallet.seed])), null, 2), { mode: 0o600 })
  return wallets
}

async function saveWallets(wallets) {
  await fs.writeFile(WALLETS, JSON.stringify(Object.fromEntries(Object.entries(wallets).map(([role, wallet]) => [role, wallet.seed])), null, 2), { mode: 0o600 })
}

async function xrpBalance(client, address) {
  try { return await client.getXrpBalance(address) } catch { return '0' }
}

async function fund(client, role, wallet) {
  const before = await xrpBalance(client, wallet.classicAddress)
  if (Number(before) > 20) {
    publicRun.accounts[role] = { address: wallet.classicAddress, xrp: before, funded: 'existing' }
    return wallet
  }
  const response = await fetch(`https://${FAUCET}${FAUCET_PATH}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ destination: wallet.classicAddress, xrpAmount: '100', userAgent: 'raise-feasibility' }),
  })
  if (!response.ok) throw new Error(`Faucet HTTP ${response.status}`)
  const faucetResponse = await response.json()
  const fundedWallet = faucetResponse.account?.secret ? Wallet.fromSeed(faucetResponse.account.secret) : wallet
  if (faucetResponse.account?.address !== fundedWallet.classicAddress) throw new Error('Faucet returned an invalid wallet')
  let after = '0'
  for (let attempt = 0; attempt < 20; attempt += 1) {
    after = await xrpBalance(client, fundedWallet.classicAddress)
    if (Number(after) > Number(before)) break
    await new Promise((resolve) => setTimeout(resolve, 1_000))
  }
  if (Number(after) <= Number(before)) throw new Error(`Faucet funding did not validate for ${role}`)
  publicRun.accounts[role] = { address: fundedWallet.classicAddress, xrp: after, funded: 'faucet' }
  return fundedWallet
}

async function submit(client, label, transaction, wallet) {
  const before = {
    account_xrp: await xrpBalance(client, wallet.classicAddress),
  }
  const response = await client.submitAndWait(transaction, { wallet, failHard: true })
  const result = response.result
  const tx = result.tx_json
  const op = {
    label,
    transaction_type: tx.TransactionType,
    engine_result: result.meta?.TransactionResult ?? 'unknown',
    hash: result.hash,
    explorer_url: explorer(result.hash),
    validated_ledger: result.ledger_index,
    before,
    after: { account_xrp: await xrpBalance(client, wallet.classicAddress) },
    tx_json: tx,
  }
  publicRun.operations.push(op)
  if (op.engine_result !== 'tesSUCCESS') throw new Error(`${label}: ${op.engine_result} (${op.hash})`)
  return op
}

async function accountMPT(client, address, issuanceID) {
  const response = await client.request({ command: 'account_objects', account: address, ledger_index: 'validated', type: 'mptoken' })
  const holding = response.result.account_objects.find((entry) => entry.MPTokenIssuanceID === issuanceID)
  return holding ? { amount: holding.MPTAmount, ledger_index: holding.index ?? holding.LedgerIndex } : null
}

async function vaultEntry(client, vaultID) {
  const response = await client.request({ command: 'ledger_entry', ledger_index: 'validated', index: vaultID })
  return response.result.node
}

function operation(label) {
  return publicRun.operations.find((entry) => entry.label === label)
}

function featureStatus(features, name) {
  return Object.values(features).find((feature) => feature.name === name)
}

async function writeResults() {
  const opRows = publicRun.operations.map((op) => [
    `### ${op.label}`,
    `- Transaction type: \`${op.transaction_type}\``,
    `- Validated engine result: \`${op.engine_result}\``,
    `- Transaction hash: \`${op.hash}\``,
    `- Explorer: ${op.explorer_url}`,
    `- Validated ledger: \`${op.validated_ledger}\``,
    `- Before: \`${JSON.stringify(op.before)}\``,
    `- After: \`${JSON.stringify(op.after)}\``,
    ...(op.executed_both_legs === undefined ? [] : [`- Both inner legs executed: \`${op.executed_both_legs}\``]),
    ...(op.payment_and_share_legs_unchanged === undefined ? [] : [`- Payment and share legs unchanged: \`${op.payment_and_share_legs_unchanged}\``]),
  ].join('\n')).join('\n\n')
  const shareTransfer = operation('Alice transfers vault shares to Bob')
  const bobWithdraw = operation('Bob withdraws underlying XRP using received shares')
  const atomicSuccess = operation('Atomic Batch: Bob XRP payment + Alice share transfer')
  const atomicFailure = operation('Atomic Batch forced failure')
  const q1 = shareTransfer?.engine_result === 'tesSUCCESS' && bobWithdraw?.engine_result === 'tesSUCCESS' ? 'PASS' : 'INCONCLUSIVE'
  const q2 = atomicSuccess?.executed_both_legs === true && atomicFailure?.payment_and_share_legs_unchanged === true ? 'PASS' : 'INCONCLUSIVE'
  const feasibility = q1 === 'PASS' && q2 === 'PASS' ? 'GO' : q1 === 'PASS' || q2 === 'PASS' ? 'PARTIAL' : 'NO-GO'
  const text = `# Raise secondary-market feasibility spike — RESULTS\n\n## Environment\n\n- SDK: ${publicRun.sdk} (pinned in \`package.json\`)\n- RPC: ${RPC}\n- WSS: ${WSS}\n- Explorer: ${EXPLORER}\n- Network: \`${JSON.stringify(publicRun.network)}\`\n\n## Disposable accounts\n\n${Object.entries(publicRun.accounts).map(([role, account]) => `- ${role}: \`${account.address}\` — ${account.xrp} XRP (${account.funded})`).join('\n')}\n\nSeeds are stored only in ignored \`wallets.json\` and are never included here.\n\n## Feature activation (live \`feature\` RPC)\n\n${publicRun.notes.map((note) => `- ${note}`).join('\n')}\n\n## Ledger operations\n\n${opRows || '_No validated transaction was submitted._'}\n\n## Public state evidence\n\n\`\`\`json\n${JSON.stringify(publicRun.state ?? {}, null, 2)}\n\`\`\`\n\n## Verdict\n\nKILL QUESTION 1 — TRANSFER + HOLDER RIGHTS: ${q1}\n\nKILL QUESTION 2 — ATOMIC SETTLEMENT: ${q2}\n\nRAISE FEASIBILITY: ${feasibility}\n`
  await fs.writeFile(RESULTS, text)
  return { q1, q2, feasibility }
}

async function main() {
  const client = new Client(WSS, { connectionTimeout: 10_000 })
  await client.connect()
  try {
    const [serverInfo, featureResponse, definitions] = await Promise.all([
      client.request({ command: 'server_info' }),
      client.request({ command: 'feature' }),
      client.request({ command: 'server_definitions' }),
    ])
    const info = serverInfo.result.info
    publicRun.network = {
      network_id: info.network_id,
      build_version: info.build_version,
      server_state: info.server_state,
      validated_ledger: info.validated_ledger,
      recognized_transactions: ['VaultCreate', 'VaultDeposit', 'VaultWithdraw', 'Batch', 'Payment'].map((name) => [name, definitions.result.TRANSACTION_TYPES[name] ?? null]),
    }
    const required = ['SingleAssetVault', 'LendingProtocol', 'MPTokensV1', 'BatchV1_1', 'LendingProtocolV1_1']
    for (const name of required) {
      const status = featureStatus(featureResponse.result.features, name)
      publicRun.notes.push(`${name}: ${status?.enabled === true ? 'enabled' : 'NOT enabled'} (live feature RPC; server definitions alone were not treated as proof)`)
      if (status?.enabled !== true) throw new Error(`Required amendment is not enabled: ${name}`)
    }

    const wallets = await loadWallets()
    for (const [role, wallet] of Object.entries(wallets)) wallets[role] = await fund(client, role, wallet)
    await saveWallets(wallets)

    const create = await submit(client, 'Create open-ended transferable XRP vault', {
      TransactionType: 'VaultCreate',
      Account: wallets.vaultOwner.classicAddress,
      Asset: { currency: 'XRP' },
      WithdrawalPolicy: 1,
      Flags: 0,
    }, wallets.vaultOwner)
    const vaultID = hashes.hashVault(wallets.vaultOwner.classicAddress, create.tx_json.Sequence)
    let vault = await vaultEntry(client, vaultID)
    const shareMPTID = vault.ShareMPTID
    const shareIssuance = await client.request({ command: 'ledger_entry', ledger_index: 'validated', mpt_issuance: shareMPTID })
    const shareFlags = shareIssuance.result.node.Flags
    publicRun.notes.push(`Vault share MPT flags: ${shareFlags} (RequireIssuerAuth=${(shareFlags & 4) !== 0}, CanTrade=${(shareFlags & 16) !== 0}, CanTransfer=${(shareFlags & 32) !== 0})`)
    await submit(client, 'Bob creates/authorizes vault-share MPT holding', {
      TransactionType: 'MPTokenAuthorize',
      Account: wallets.bob.classicAddress,
      MPTokenIssuanceID: shareMPTID,
    }, wallets.bob)

    const aliceBeforeDeposit = { xrp: await xrpBalance(client, wallets.alice.classicAddress), shares: await accountMPT(client, wallets.alice.classicAddress, shareMPTID) }
    const deposit = await submit(client, 'Alice deposits XRP into vault', {
      TransactionType: 'VaultDeposit',
      Account: wallets.alice.classicAddress,
      VaultID: vaultID,
      Amount: xrpToDrops('10'),
    }, wallets.alice)
    vault = await vaultEntry(client, vaultID)
    const aliceAfterDeposit = { xrp: await xrpBalance(client, wallets.alice.classicAddress), shares: await accountMPT(client, wallets.alice.classicAddress, shareMPTID), vault }
    deposit.before = aliceBeforeDeposit
    deposit.after = aliceAfterDeposit
    if (!aliceAfterDeposit.shares || BigInt(aliceAfterDeposit.shares.amount) === 0n) throw new Error('Alice did not receive a vault share MPT holding after deposit')

    const aliceBeforeTransfer = await accountMPT(client, wallets.alice.classicAddress, shareMPTID)
    const bobBeforeTransfer = await accountMPT(client, wallets.bob.classicAddress, shareMPTID)
    const transferAmount = BigInt(aliceAfterDeposit.shares.amount) / 10n
    if (transferAmount <= 0n) throw new Error('Vault minted too few shares for transfer test')
    const transfer = await submit(client, 'Alice transfers vault shares to Bob', {
      TransactionType: 'Payment',
      Account: wallets.alice.classicAddress,
      Destination: wallets.bob.classicAddress,
      Amount: { mpt_issuance_id: shareMPTID, value: transferAmount.toString() },
    }, wallets.alice)
    const aliceAfterTransfer = await accountMPT(client, wallets.alice.classicAddress, shareMPTID)
    const bobAfterTransfer = await accountMPT(client, wallets.bob.classicAddress, shareMPTID)
    transfer.before = { alice_shares: aliceBeforeTransfer, bob_shares: bobBeforeTransfer }
    transfer.after = { alice_shares: aliceAfterTransfer, bob_shares: bobAfterTransfer }
    if (!bobAfterTransfer || BigInt(bobAfterTransfer.amount) < transferAmount) throw new Error('Bob did not receive the transferred share MPT')

    vault = await vaultEntry(client, vaultID)
    const withdrawalDrops = '1000000'
    const bobBeforeWithdraw = { xrp: await xrpBalance(client, wallets.bob.classicAddress), shares: await accountMPT(client, wallets.bob.classicAddress, shareMPTID), vault }
    const withdraw = await submit(client, 'Bob withdraws underlying XRP using received shares', {
      TransactionType: 'VaultWithdraw',
      Account: wallets.bob.classicAddress,
      VaultID: vaultID,
      Amount: withdrawalDrops,
    }, wallets.bob)
    const bobAfterWithdraw = { xrp: await xrpBalance(client, wallets.bob.classicAddress), shares: await accountMPT(client, wallets.bob.classicAddress, shareMPTID), vault: await vaultEntry(client, vaultID) }
    withdraw.before = bobBeforeWithdraw
    withdraw.after = bobAfterWithdraw

    // The zero-share redemption removes Bob's MPToken object, so recreate the
    // holder object before testing a secondary-market delivery to Bob.
    await submit(client, 'Bob recreates vault-share MPT holding for atomic test', {
      TransactionType: 'MPTokenAuthorize',
      Account: wallets.bob.classicAddress,
      MPTokenIssuanceID: shareMPTID,
    }, wallets.bob)

    // Test a two-account XLS-56 Batch. The outer account is Alice; Bob authorizes
    // his XRP-payment inner transaction and Alice signs the outer Batch.
    const atomicShares = BigInt((await accountMPT(client, wallets.alice.classicAddress, shareMPTID)).amount) / 20n
    const paymentDrops = '1000000'
    if (atomicShares <= 0n) throw new Error('Alice has too few remaining shares for atomic test')
    const successBefore = {
      alice_xrp: await xrpBalance(client, wallets.alice.classicAddress),
      bob_xrp: await xrpBalance(client, wallets.bob.classicAddress),
      alice_shares: await accountMPT(client, wallets.alice.classicAddress, shareMPTID),
      bob_shares: await accountMPT(client, wallets.bob.classicAddress, shareMPTID),
    }
    const batch = {
      TransactionType: 'Batch',
      Account: wallets.alice.classicAddress,
      Flags: BatchFlags.tfAllOrNothing,
      RawTransactions: [
        { RawTransaction: { TransactionType: 'Payment', Account: wallets.bob.classicAddress, Destination: wallets.alice.classicAddress, Amount: paymentDrops, Flags: GlobalFlags.tfInnerBatchTxn } },
        { RawTransaction: { TransactionType: 'Payment', Account: wallets.alice.classicAddress, Destination: wallets.bob.classicAddress, Amount: { mpt_issuance_id: shareMPTID, value: atomicShares.toString() }, Flags: GlobalFlags.tfInnerBatchTxn } },
      ],
    }
    const filledBatch = await client.autofill(batch, 1)
    signMultiBatch(wallets.bob, filledBatch)
    const signedBatch = wallets.alice.sign(filledBatch)
    const atomicResponse = await client.submitAndWait(signedBatch.tx_blob)
    const atomic = {
      label: 'Atomic Batch: Bob XRP payment + Alice share transfer', transaction_type: 'Batch', engine_result: atomicResponse.result.meta?.TransactionResult ?? 'unknown', hash: atomicResponse.result.hash, explorer_url: explorer(atomicResponse.result.hash), validated_ledger: atomicResponse.result.ledger_index, before: successBefore,
      after: { alice_xrp: await xrpBalance(client, wallets.alice.classicAddress), bob_xrp: await xrpBalance(client, wallets.bob.classicAddress), alice_shares: await accountMPT(client, wallets.alice.classicAddress, shareMPTID), bob_shares: await accountMPT(client, wallets.bob.classicAddress, shareMPTID) }, tx_json: atomicResponse.result.tx_json,
    }
    atomic.executed_both_legs = BigInt(xrpToDrops(atomic.after.bob_xrp)) === BigInt(xrpToDrops(successBefore.bob_xrp)) - 1_000_000n
      && atomic.after.alice_shares?.amount === (BigInt(successBefore.alice_shares.amount) - atomicShares).toString()
      && atomic.after.bob_shares?.amount === atomicShares.toString()
    publicRun.operations.push(atomic)
    if (atomic.engine_result !== 'tesSUCCESS' || !atomic.executed_both_legs) throw new Error(`Atomic Batch success case did not execute both legs: ${atomic.engine_result}`)

    const failureBefore = {
      alice_xrp: await xrpBalance(client, wallets.alice.classicAddress), bob_xrp: await xrpBalance(client, wallets.bob.classicAddress), alice_shares: await accountMPT(client, wallets.alice.classicAddress, shareMPTID), bob_shares: await accountMPT(client, wallets.bob.classicAddress, shareMPTID),
    }
    const badBatch = {
      TransactionType: 'Batch', Account: wallets.alice.classicAddress, Flags: BatchFlags.tfAllOrNothing,
      RawTransactions: [
        { RawTransaction: { TransactionType: 'Payment', Account: wallets.bob.classicAddress, Destination: wallets.alice.classicAddress, Amount: '2000000000', Flags: GlobalFlags.tfInnerBatchTxn } },
        { RawTransaction: { TransactionType: 'Payment', Account: wallets.alice.classicAddress, Destination: wallets.bob.classicAddress, Amount: { mpt_issuance_id: shareMPTID, value: '1' }, Flags: GlobalFlags.tfInnerBatchTxn } },
      ],
    }
    const filledBadBatch = await client.autofill(badBatch, 1)
    signMultiBatch(wallets.bob, filledBadBatch)
    const signedBadBatch = wallets.alice.sign(filledBadBatch)
    const failedResponse = await client.submitAndWait(signedBadBatch.tx_blob)
    const atomicFailure = { label: 'Atomic Batch forced failure', transaction_type: 'Batch', engine_result: failedResponse.result.meta?.TransactionResult ?? 'unknown', hash: failedResponse.result.hash, explorer_url: explorer(failedResponse.result.hash), validated_ledger: failedResponse.result.ledger_index, before: failureBefore, after: { alice_xrp: await xrpBalance(client, wallets.alice.classicAddress), bob_xrp: await xrpBalance(client, wallets.bob.classicAddress), alice_shares: await accountMPT(client, wallets.alice.classicAddress, shareMPTID), bob_shares: await accountMPT(client, wallets.bob.classicAddress, shareMPTID) }, tx_json: failedResponse.result.tx_json }
    atomicFailure.payment_and_share_legs_unchanged = atomicFailure.after.bob_xrp === failureBefore.bob_xrp
      && atomicFailure.after.alice_shares?.amount === failureBefore.alice_shares?.amount
      && atomicFailure.after.bob_shares?.amount === failureBefore.bob_shares?.amount
    publicRun.operations.push(atomicFailure)

    publicRun.state = { vault_id: vaultID, share_mpt_issuance_id: shareMPTID, vault: await vaultEntry(client, vaultID) }
  } catch (error) {
    publicRun.notes.push(`Run stopped: ${error.message}`)
    publicRun.state ??= {}
  } finally {
    const verdict = await writeResults()
    await client.disconnect()
    console.log(JSON.stringify(verdict))
  }
}

await main()
