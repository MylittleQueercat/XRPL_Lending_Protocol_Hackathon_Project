import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Client, LoanPayFlags, Wallet, signLoanSetByCounterparty, type LoanSet, type SubmittableTransaction } from 'xrpl';
import { assertValidated, parseXrp, record, TRACK1, type NetworkReport } from './core.js';
import { createRunDirectory, writePrivateJson } from './storage.js';
import { buildVaultCreate, fundWallet, readBalance, submitValidated } from './vault.js';

// Loan terms. Rates are 1/10 bps, so 100000 is 100 % annualised; intervals and grace are seconds.
// The ledger rejects GracePeriod below 60 with an opaque temINVALID, which xrpl.js 5.2.0 does not catch.
//
// Yield here is elapsed interest, and nothing else. Measured on this network: an early full payment
// charges principal plus interest accrued to date, not the remaining schedule, and the ledger caps
// the charge at what is owed (offering 241 XRP against 80 XRP outstanding debited 50.000011 XRP).
// ClosePaymentFee does not reach the vault either. So the lender's yield is bounded by
// principal x rate x elapsed time, and with the rate capped at 100 % annualised a demo loan yields
// drops. That is a property of the protocol, not a flaw in this flow: it is reported exactly.
//
// Seconds the loan stays open before early repayment, so accrued interest is measurable.
export const HOLD_SECONDS = Number(process.env.RAISE_LOAN_HOLD_SECONDS ?? 120);

export const LOAN_TERMS = Object.freeze({
  principalXrp: '50', depositXrp: '100', coverXrp: '20',
  interestRate: 100000, paymentInterval: 2_592_000, paymentTotal: 12, gracePeriod: 86_400,
  closePaymentFeeXrp: '5', closeInterestRate: 0,
  coverRateMinimum: 10000, coverRateLiquidation: 10000,
});

export function buildLoanBrokerSet(address: string, vaultId: string): SubmittableTransaction {
  return {
    TransactionType: 'LoanBrokerSet', Account: address, VaultID: vaultId, ManagementFeeRate: 0,
    DebtMaximum: parseXrp('1000'), CoverRateMinimum: LOAN_TERMS.coverRateMinimum,
    CoverRateLiquidation: LOAN_TERMS.coverRateLiquidation,
  } as SubmittableTransaction;
}

export function buildLoanSet(brokerAddress: string, borrowerAddress: string, loanBrokerId: string): SubmittableTransaction {
  return {
    TransactionType: 'LoanSet', Account: brokerAddress, Counterparty: borrowerAddress,
    LoanBrokerID: loanBrokerId, PrincipalRequested: parseXrp(LOAN_TERMS.principalXrp),
    InterestRate: LOAN_TERMS.interestRate, PaymentInterval: LOAN_TERMS.paymentInterval,
    PaymentTotal: LOAN_TERMS.paymentTotal, GracePeriod: LOAN_TERMS.gracePeriod,
    LoanOriginationFee: '0', LoanServiceFee: '0',
    ClosePaymentFee: parseXrp(LOAN_TERMS.closePaymentFeeXrp), CloseInterestRate: LOAN_TERMS.closeInterestRate,
  } as SubmittableTransaction;
}

// A guardrail proof needs the ledger's rejection code, so this path must not throw on tec results.
async function submitAllowingRejection(client: Client, transaction: SubmittableTransaction, wallet: Wallet, directory: string) {
  const prepared = await client.autofill(transaction);
  if (prepared.NetworkID !== TRACK1.networkId) throw new Error('Autofilled transaction has an unexpected NetworkID.');
  const signed = wallet.sign(prepared);
  await writePrivateJson(join(directory, `${transaction.TransactionType}-guardrail-intent.json`), { hash: signed.hash });
  const result = (await client.submitAndWait(signed.tx_blob)).result;
  if (result.validated !== true) throw new Error('Guardrail transaction is not validated; never resubmit blindly.');
  const meta = record(result.meta, 'transaction metadata');
  return {
    hash: String(result.hash), ledgerIndex: Number(result.ledger_index), resultCode: String(meta.TransactionResult),
    transactionType: transaction.TransactionType, feeDrops: String(prepared.Fee),
    explorer: `${TRACK1.explorerUrl}/transactions/${String(result.hash)}`,
  };
}

// LoanSet carries two signatures and xrpl.js requires the Account to sign before the counterparty.
async function submitLoanSet(client: Client, transaction: SubmittableTransaction, broker: Wallet, borrower: Wallet, directory: string) {
  const prepared = await client.autofill(transaction);
  if (prepared.NetworkID !== TRACK1.networkId) throw new Error('Autofilled transaction has an unexpected NetworkID.');
  const brokerSigned = broker.sign(prepared);
  const fullySigned = signLoanSetByCounterparty(borrower, brokerSigned.tx_blob as unknown as LoanSet);
  await writePrivateJson(join(directory, 'LoanSet-intent.json'), { hash: fullySigned.hash, lastLedgerSequence: prepared.LastLedgerSequence });
  const result = (await client.submitAndWait(fullySigned.tx_blob)).result;
  const validated = assertValidated(result);
  const evidence = {
    ...validated, transactionType: 'LoanSet', feeDrops: String(prepared.Fee),
    explorer: `${TRACK1.explorerUrl}/transactions/${validated.hash}`,
  };
  await writePrivateJson(join(directory, 'LoanSet.json'), evidence);
  return { evidence, meta: record(result.meta, 'transaction metadata') };
}

export function createdEntry(meta: Record<string, unknown>, entryType: string): string {
  if (!Array.isArray(meta.AffectedNodes)) throw new Error(`${entryType} metadata has no affected nodes.`);
  for (const value of meta.AffectedNodes) {
    const node = record(value, 'affected node');
    if (!node.CreatedNode) continue;
    const created = record(node.CreatedNode, 'created node');
    if (created.LedgerEntryType === entryType && typeof created.LedgerIndex === 'string') return created.LedgerIndex;
  }
  throw new Error(`No newly created ${entryType} was found in validated metadata.`);
}

async function readEntry(client: Client, index: string, ledgerIndex: number | 'validated' = 'validated') {
  const response = await client.request({ command: 'ledger_entry', index, ledger_index: ledgerIndex });
  if (response.result.validated !== true) throw new Error('Ledger entry snapshot is not validated.');
  return record(response.result.node, 'ledger entry');
}

async function vaultAssets(client: Client, vaultId: string, ledgerIndex: number | 'validated' = 'validated') {
  const vault = await readEntry(client, vaultId, ledgerIndex);
  if (vault.LedgerEntryType !== 'Vault') throw new Error('Unexpected vault ledger entry.');
  return {
    availableDrops: String(vault.AssetsAvailable ?? '0'), totalDrops: String(vault.AssetsTotal ?? '0'),
    shareMptId: String(vault.ShareMPTID ?? ''),
  };
}

// Share supply outstanding across all holders, which is what a redemption burns.
async function shareSupply(client: Client, shareMptId: string, ledgerIndex: number | 'validated' = 'validated') {
  const response = await client.request({ command: 'ledger_entry', mpt_issuance: shareMptId, ledger_index: ledgerIndex });
  if (response.result.validated !== true) throw new Error('Share issuance snapshot is not validated.');
  const issuance = record(response.result.node, 'share issuance');
  if (issuance.LedgerEntryType !== 'MPTokenIssuance') throw new Error('Unexpected share issuance entry.');
  return String(issuance.OutstandingAmount ?? '0');
}

// One holder's share balance. Absent holder objects read as zero rather than throwing, so the
// guardrail can state the lender's holding at the moment of rejection.
async function shareBalance(client: Client, address: string, shareMptId: string, ledgerIndex: number | 'validated' = 'validated') {
  try {
    const response = await client.request({ command: 'account_objects', account: address, type: 'mptoken', ledger_index: ledgerIndex });
    for (const value of response.result.account_objects ?? []) {
      const holding = record(value, 'mptoken holding');
      if (String(holding.MPTokenIssuanceID) === shareMptId) return String(holding.MPTAmount ?? '0');
    }
    return '0';
  } catch {
    return '0';
  }
}

// The broker's first-loss cover, which must clear CoverRateMinimum before origination is allowed.
async function brokerCover(client: Client, loanBrokerId: string, ledgerIndex: number | 'validated' = 'validated') {
  const entry = await readEntry(client, loanBrokerId, ledgerIndex);
  if (entry.LedgerEntryType !== 'LoanBroker') throw new Error('Unexpected loan broker ledger entry.');
  return {
    coverAvailableDrops: String(entry.CoverAvailable ?? '0'), debtTotalDrops: String(entry.DebtTotal ?? '0'),
    coverRateMinimum: Number(entry.CoverRateMinimum ?? 0),
  };
}

// Loan economics split the way issue #9 asks: principal apart from the scheduled total.
function loanPosition(loan: Record<string, unknown>) {
  const principal = String(loan.PrincipalOutstanding ?? '0');
  const totalValue = String(loan.TotalValueOutstanding ?? '0');
  return {
    principalOutstandingDrops: principal, totalValueOutstandingDrops: totalValue,
    scheduledInterestRemainingDrops: (BigInt(totalValue) - BigInt(principal)).toString(),
    periodicPaymentDrops: String(loan.PeriodicPayment ?? '0'), paymentRemaining: Number(loan.PaymentRemaining ?? 0),
  };
}

export async function runVanillaFlow(client: Client, network: NetworkReport) {
  if (!network.vanillaReady || network.networkId !== TRACK1.networkId) throw new Error('The Vanilla flow requires the verified Track 1 hackathon network.');
  const directory = await createRunDirectory('vanilla-flow');
  await writePrivateJson(join(directory, 'network.json'), network);
  try {
    const broker = await fundWallet(client, 'broker', directory);
    const lender = await fundWallet(client, 'lender', directory);
    const borrower = await fundWallet(client, 'borrower', directory);

    // 1. Open-ended Single Asset Vault (XLS-65).
    const create = await submitValidated(client, buildVaultCreate(broker.address), broker, directory);
    const vaultId = createdEntry(create.meta, 'Vault');

    // 2. Lender capital.
    const depositDrops = parseXrp(LOAN_TERMS.depositXrp);
    const lenderStart = await readBalance(client, lender.address);
    const deposit = await submitValidated(client, { TransactionType: 'VaultDeposit', Account: lender.address, VaultID: vaultId, Amount: depositDrops }, lender, directory);
    const afterDeposit = await vaultAssets(client, vaultId, deposit.evidence.ledgerIndex);
    if (afterDeposit.availableDrops !== depositDrops) throw new Error('Validated deposit did not produce the expected vault liquidity.');

    // 3. Loan broker plus its first-loss cover.
    const brokerSet = await submitValidated(client, buildLoanBrokerSet(broker.address, vaultId), broker, directory);
    const loanBrokerId = createdEntry(brokerSet.meta, 'LoanBroker');
    const coverDeposit = await submitValidated(client, { TransactionType: 'LoanBrokerCoverDeposit', Account: broker.address, LoanBrokerID: loanBrokerId, Amount: parseXrp(LOAN_TERMS.coverXrp) } as SubmittableTransaction, broker, directory);
    const coverAfterDeposit = await brokerCover(client, loanBrokerId, coverDeposit.evidence.ledgerIndex);
    if (coverAfterDeposit.coverAvailableDrops !== parseXrp(LOAN_TERMS.coverXrp)) throw new Error('Broker cover balance does not match the validated deposit.');

    // 4. Origination accepted by the borrower, which disburses the principal in the same transaction.
    const borrowerBeforeLoan = await readBalance(client, borrower.address);
    const loanSet = await submitLoanSet(client, buildLoanSet(broker.address, borrower.address, loanBrokerId), broker, borrower, directory);
    const loanId = createdEntry(loanSet.meta, 'Loan');
    const borrowerAfterLoan = await readBalance(client, borrower.address, loanSet.evidence.ledgerIndex);
    const drawdownDrops = (BigInt(borrowerAfterLoan) - BigInt(borrowerBeforeLoan) + BigInt(loanSet.evidence.feeDrops)).toString();
    if (BigInt(drawdownDrops) <= 0n) throw new Error('Origination did not deliver the principal to the borrower.');
    const afterOrigination = await vaultAssets(client, vaultId, loanSet.evidence.ledgerIndex);

    // 5. Guardrail: the lender holds enough shares, but the vault no longer holds enough cash.
    const sharesBeforeGuardrail = await shareBalance(client, lender.address, afterDeposit.shareMptId, loanSet.evidence.ledgerIndex);
    const guardrail = await submitAllowingRejection(client, { TransactionType: 'VaultWithdraw', Account: lender.address, VaultID: vaultId, Amount: depositDrops }, lender, directory);
    if (guardrail.resultCode === 'tesSUCCESS') throw new Error('The insufficient-liquidity guardrail did not reject the withdrawal.');
    const sharesAfterGuardrail = await shareBalance(client, lender.address, afterDeposit.shareMptId, guardrail.ledgerIndex);
    // The rejection must be about vault cash, not about the lender's holding.
    if (BigInt(sharesBeforeGuardrail) <= 0n) throw new Error('Cannot prove the guardrail: the lender held no shares.');
    if (sharesAfterGuardrail !== sharesBeforeGuardrail) throw new Error('The rejected withdrawal still moved shares.');

    // 6. Hold the loan open so interest accrues by elapsed time, then repay early.
    // Early close charges principal plus interest accrued to date, not the whole schedule, so
    // without a hold the yield is a handful of drops and indistinguishable from rounding.
    await delay(HOLD_SECONDS * 1000);
    const loan = await readEntry(client, loanId, guardrail.ledgerIndex);
    const owedDrops = String(loan.TotalValueOutstanding ?? '0');
    // Early close also charges the prepayment fee and close interest, so the outstanding value alone
    // would under-pay. The ledger caps the charge at what is truly owed, so offering more is safe.
    const offeredDrops = (BigInt(owedDrops) * 3n).toString();
    const loanBeforeRepayment = loanPosition(loan);
    const borrowerBeforeRepayment = await readBalance(client, borrower.address);
    const repayment = await submitValidated(client, { TransactionType: 'LoanPay', Account: borrower.address, LoanID: loanId, Amount: offeredDrops, Flags: LoanPayFlags.tfLoanFullPayment } as SubmittableTransaction, borrower, directory);
    const afterRepayment = await vaultAssets(client, vaultId, repayment.evidence.ledgerIndex);
    const borrowerAfterRepayment = await readBalance(client, borrower.address, repayment.evidence.ledgerIndex);
    const repaidDrops = (BigInt(borrowerBeforeRepayment) - BigInt(borrowerAfterRepayment) - BigInt(repayment.evidence.feeDrops)).toString();

    // 7. Redeem capital plus the yield the repayment realised.
    const redeemDrops = afterRepayment.availableDrops;
    const supplyBeforeRedeem = await shareSupply(client, afterDeposit.shareMptId, repayment.evidence.ledgerIndex);
    const withdraw = await submitValidated(client, { TransactionType: 'VaultWithdraw', Account: lender.address, VaultID: vaultId, Amount: redeemDrops }, lender, directory);
    const lenderEnd = await readBalance(client, lender.address, withdraw.evidence.ledgerIndex);
    const supplyAfterRedeem = await shareSupply(client, afterDeposit.shareMptId, withdraw.evidence.ledgerIndex);
    const sharesAfterRedeem = await shareBalance(client, lender.address, afterDeposit.shareMptId, withdraw.evidence.ledgerIndex);
    if (BigInt(supplyAfterRedeem) >= BigInt(supplyBeforeRedeem)) throw new Error('Redemption did not burn any share supply.');
    const yieldDrops = (BigInt(redeemDrops) - BigInt(depositDrops)).toString();

    const report = {
      status: 'verified',
      scope: 'Track 1 Vanilla baseline: open-ended XLS-65 vault plus the XLS-66 broker, origination, drawdown, guardrail, repayment and redemption.',
      completedAt: new Date().toISOString(), network, directory,
      accounts: { broker: broker.address, lender: lender.address, borrower: borrower.address },
      ledgerObjects: { vaultId, loanBrokerId, loanId },
      terms: LOAN_TERMS,
      transactions: [create.evidence, deposit.evidence, brokerSet.evidence, loanSet.evidence, guardrail, repayment.evidence, withdraw.evidence],
      // Issue #8 asks to separate a liquidity rejection from an insufficient personal holding, so
      // the lender's share balance at the moment of rejection is part of the proof, not a detail.
      guardrail: {
        transactionType: 'VaultWithdraw', requestedDrops: depositDrops,
        availableDrops: afterOrigination.availableDrops, resultCode: guardrail.resultCode, hash: guardrail.hash,
        lenderSharesBefore: sharesBeforeGuardrail, lenderSharesAfter: sharesAfterGuardrail,
        cause: 'vault liquidity, not the lender holding: shares were sufficient and unchanged by the rejection',
      },
      amounts: { depositDrops, drawdownDrops, owedAtRepaymentDrops: owedDrops, offeredAtRepaymentDrops: offeredDrops, redeemedDrops: redeemDrops, yieldDrops },
      interestAccrual: {
        heldSeconds: HOLD_SECONDS,
        observedDrops: yieldDrops,
        // principal x annual rate x elapsed share of a year, the contract's own formula.
        expectedDrops: Math.round((Number(parseXrp(LOAN_TERMS.principalXrp)) * (LOAN_TERMS.interestRate / 100000) * HOLD_SECONDS) / 31_536_000).toString(),
      },
      vaultAssets: { afterDeposit, afterOrigination, afterRepayment },
      brokerCover: coverAfterDeposit,
      loanPosition: { beforeRepayment: loanBeforeRepayment, afterRepayment: 'closed by full payment' },
      shares: {
        mptIssuanceId: afterDeposit.shareMptId,
        lenderHeldBeforeRedeem: sharesBeforeGuardrail, lenderHeldAfterRedeem: sharesAfterRedeem,
        supplyBeforeRedeem, supplyAfterRedeem,
        burnedDrops: (BigInt(supplyBeforeRedeem) - BigInt(supplyAfterRedeem)).toString(),
      },
      repayment: { offeredDrops, actuallyChargedDrops: repaidDrops, borrowerBalanceDrops: { before: borrowerBeforeRepayment, after: borrowerAfterRepayment } },
      lenderBalancesDrops: { start: lenderStart, end: lenderEnd },
      // V1.1 is enabled on this network, so interest is realised when a payment delivers it.
      accountingBasis: 'cash', fullVanillaComplete: true,
    };
    await writePrivateJson(join(directory, 'report.json'), report);
    return report;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown failure';
    await writePrivateJson(join(directory, 'failure.json'), { status: 'failed', directory, message, fullVanillaComplete: false });
    throw new Error(`Vanilla flow stopped. Inspect local evidence in ${directory}. ${message}`);
  }
}
