import { describe, expect, it } from 'vitest';
import { BatchFlags, GlobalFlags } from 'xrpl';
import { bothLegsUnchanged, buildSaleBatch, SETTLEMENT } from '../src/settlement.js';

const SELLER = 'rzqEAQrkcXMjaKUMYdV6DXT4ybeaDWWjd';
const BUYER = 'rf1shBFJwP5xNgySBYAey4X1txqq839rG1';
const MPT = '0000000161A20F6B9EA4A24BE20D61DF845A2214DA1E7875';

describe('sale batch construction', () => {
  const tx = buildSaleBatch(SELLER, BUYER, MPT, '5000000', SETTLEMENT.sharesTraded) as unknown as Record<string, any>;

  it('settles all-or-nothing, never partially', () => {
    expect(tx.Flags).toBe(BatchFlags.tfAllOrNothing);
  });
  it('pays the seller and delivers shares to the buyer in one transaction', () => {
    const [payment, delivery] = tx.RawTransactions.map((r: any) => r.RawTransaction);
    expect(payment.Account).toBe(BUYER);
    expect(payment.Destination).toBe(SELLER);
    expect(delivery.Account).toBe(SELLER);
    expect(delivery.Destination).toBe(BUYER);
    expect(delivery.Amount.mpt_issuance_id).toBe(MPT);
  });
  it('marks both legs as inner transactions, which the ledger requires', () => {
    for (const { RawTransaction } of tx.RawTransactions) expect(RawTransaction.Flags).toBe(GlobalFlags.tfInnerBatchTxn);
  });
  it('is signed by the seller, so the buyer authorises only their own leg', () => {
    expect(tx.Account).toBe(SELLER);
  });
});

describe('settlement guarantee check', () => {
  const base = { sellerXrp: '1000000000', buyerXrp: '1000000000', sellerShares: '5000000', buyerShares: '0' };

  it('accepts an outer fee but no economic movement', () => {
    const after = { ...base, sellerXrp: '999999940' };
    const g = bothLegsUnchanged(base, after);
    expect(g.sharesUnchanged).toBe(true);
    expect(g.paymentUnchanged).toBe(true);
  });
  it('rejects a share delivery that happened without payment', () => {
    const after = { ...base, sellerShares: '4000000', buyerShares: '1000000' };
    expect(bothLegsUnchanged(base, after).sharesUnchanged).toBe(false);
  });
  it('rejects a payment that happened without delivery', () => {
    const after = { ...base, sellerXrp: '1005000000', buyerXrp: '995000000' };
    expect(bothLegsUnchanged(base, after).paymentUnchanged).toBe(false);
  });
  it('does not mistake a large debit for a fee', () => {
    const after = { ...base, sellerXrp: '900000000' };
    expect(bothLegsUnchanged(base, after).paymentUnchanged).toBe(false);
  });
});
