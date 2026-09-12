import { describe, expect, it } from 'vitest';
import type { CreateOfferInput, SettlementProof } from '../src/offers.js';
import { bindPartialTransaction, cancelPartialOrder, createPartialOrder, expirePartialOrder, quotePartialFill, reconcilePartialFill, reservePartialFill, type PartialOrder, type PartialVerificationContext } from '../src/partial-fills.js';

const seller='rLNzsCg1LPnytzSdf4hLk7inC58BFzuX6J',buyer='rJDP7VqdEJSq4UyUavaXp2m8wfyWLADCCs';
const now=Date.parse('2026-09-12T10:00:00.000Z');
const input:CreateOfferInput={networkId:4001,vaultId:'A'.repeat(64),shareMptId:'B'.repeat(48),seller,sharesRaw:'10',priceAsset:{currency:'XRP'},priceDrops:'7',expiresAt:new Date(now+3600000).toISOString()};
function order(patch:Partial<CreateOfferInput>={}):PartialOrder{return createPartialOrder('partial-order',{...input,...patch},now);}
function proof(context:PartialVerificationContext):SettlementProof {
  return {attemptId:context.attemptId,networkId:4001,transactionHash:context.transactionHash,ledgerHash:'E'.repeat(64),ledgerIndex:context.preflightLedgerIndex+1,shares:{from:context.seller,to:context.buyer,shareMptId:context.shareMptId,sharesRaw:context.sharesRaw},payment:{from:context.buyer,to:context.seller,asset:{currency:'XRP'},drops:context.priceDrops}};
}
function reserve(state:PartialOrder,quantity='3',id='fill-1',hash='C'.repeat(64)) {
  const reserved=reservePartialFill(state,{attemptId:id,buyer,sharesRaw:quantity,preflightLedgerIndex:100},now+1000);
  return bindPartialTransaction(reserved,id,hash);
}
async function complete(state:PartialOrder):Promise<PartialOrder>{
  return reconcilePartialFill(state,{attemptId:state.pending!.attemptId,transactionHash:state.pending!.transactionHash!},{verify:async context=>proof(context)});
}
describe('standalone partial-fill domain prototype',()=>{
  it('allocates whole-drop prices cumulatively, preserving the exact full-order price',async()=>{
    let state=order();expect(quotePartialFill(state,'3')).toEqual({sharesRaw:'3',priceDrops:'2',remainingSharesRaw:'7',remainingPriceDrops:'5'});
    state=await complete(reserve(state));
    expect(quotePartialFill(state,'3').priceDrops).toBe('2');
    state=await complete(reserve(state,'3','fill-2','D'.repeat(64)));
    expect(quotePartialFill(state,'4').priceDrops).toBe('3');
    state=await complete(reserve(state,'4','fill-3','F'.repeat(64)));
    expect(state).toMatchObject({status:'filled',filledSharesRaw:'10',receivedDrops:'7',pending:null});
    expect(state.fills).toHaveLength(3);
  });
  it('keeps amounts above the safe Number limit exact and rejects a zero-drop quote',()=>{
    const large=order({sharesRaw:'9223372036854775807',priceDrops:'100000000000000000'});
    expect(quotePartialFill(large,'9223372036854775807').priceDrops).toBe('100000000000000000');
    expect(()=>quotePartialFill(order(),'1')).toThrow(/one drop|zero/i);
    expect(()=>quotePartialFill(order(),'11')).toThrow(/remaining|overfill/i);
  });
  it('never mutates its input and blocks a second pending reservation or self-purchase',()=>{
    const initial=order();const state=reserve(initial);
    expect(initial.pending).toBeNull();expect(initial.revision).toBe(0);expect(state.revision).toBe(2);
    expect(()=>reservePartialFill(state,{attemptId:'fill-2',buyer,sharesRaw:'2',preflightLedgerIndex:101},now+2000)).toThrow(/pending/i);
    expect(()=>reservePartialFill(initial,{attemptId:'fill-1',buyer:seller,sharesRaw:'3',preflightLedgerIndex:100},now+1000)).toThrow(/seller|buyer/i);
  });
  it('binds one immutable hash and refuses verification before a hash is recorded',async()=>{
    const state=reservePartialFill(order(),{attemptId:'fill-1',buyer,sharesRaw:'3',preflightLedgerIndex:100},now+1000);
    await expect(reconcilePartialFill(state,{attemptId:'fill-1',transactionHash:'C'.repeat(64)},{verify:async context=>proof(context)})).rejects.toThrow(/hash|bound/i);
    const bound=bindPartialTransaction(state,'fill-1','C'.repeat(64));
    expect(bindPartialTransaction(bound,'fill-1','C'.repeat(64))).toEqual(bound);
    expect(()=>bindPartialTransaction(bound,'fill-1','D'.repeat(64))).toThrow(/immutable|hash/i);
  });
  it('retains an unknown outcome without reopening, reducing remaining shares, or consuming price',async()=>{
    const state=reserve(order());const unchanged=await reconcilePartialFill(state,{attemptId:'fill-1',transactionHash:'C'.repeat(64)},{verify:async()=>null});
    expect(unchanged).toEqual(state);expect(unchanged.filledSharesRaw).toBe('0');
    expect(()=>reserve(unchanged,'2','fill-2')).toThrow(/pending/i);
  });
  it.each(['quantity','price','buyer','seller','issuance','hash','attempt','ledger','network'])('rejects a trusted-adapter result with mismatched %s context',async kind=>{
    const state=reserve(order());
    await expect(reconcilePartialFill(state,{attemptId:'fill-1',transactionHash:'C'.repeat(64)},{verify:async context=>{
      const p=proof(context);
      if(kind==='quantity')p.shares.sharesRaw='4';if(kind==='price')p.payment.drops='3';if(kind==='buyer')p.shares.to=seller;if(kind==='seller')p.payment.to=buyer;if(kind==='issuance')p.shares.shareMptId='D'.repeat(48);if(kind==='hash')p.transactionHash='D'.repeat(64);if(kind==='attempt')p.attemptId='another';if(kind==='ledger')p.ledgerIndex=100;if(kind==='network')(p as {networkId:number}).networkId=1;
      return p;
    }})).rejects.toThrow(/proof|context/i);
    expect(state.filledSharesRaw).toBe('0');
  });
  it('snapshots the reservation before awaiting a verifier so external mutation cannot change credited quantity',async()=>{
    const pending=reserve(order());
    const settled=await reconcilePartialFill(pending,{attemptId:'fill-1',transactionHash:'C'.repeat(64)},{verify:async context=>{
      pending.pending!.sharesRaw='4';
      return proof(context);
    }});
    expect(settled.filledSharesRaw).toBe('3');expect(settled.fills[0]!.sharesRaw).toBe('3');
  });
  it('makes a repeated successful proof idempotent and refuses reuse of IDs or hashes',async()=>{
    const settled=await complete(reserve(order()));
    const again=await reconcilePartialFill(settled,{attemptId:'fill-1',transactionHash:'C'.repeat(64)},{verify:async()=>{throw new Error('Must not reverify an already recorded fill');}});
    expect(again).toEqual(settled);
    await expect(reconcilePartialFill(settled,{attemptId:'fill-1',transactionHash:'D'.repeat(64)},{verify:async context=>proof(context)})).rejects.toThrow(/hash|replay/i);
    expect(()=>reserve(settled,'3','fill-1','D'.repeat(64))).toThrow(/used|attempt/i);
    expect(()=>reserve(settled,'3','fill-2','C'.repeat(64))).toThrow(/used|hash/i);
  });
  it('cancels only the remainder; a pending authorization can still settle afterward',async()=>{
    const pending=reserve(order());expect(()=>cancelPartialOrder(pending,buyer)).toThrow(/seller/i);
    const cancelled=cancelPartialOrder(pending,seller);expect(cancelled.pending).toEqual(pending.pending);
    const filled=await complete(cancelled);
    expect(filled).toMatchObject({status:'cancelled',filledSharesRaw:'3',receivedDrops:'2',pending:null});
    expect(()=>reserve(filled,'3','fill-2','D'.repeat(64))).toThrow(/open|cancelled/i);
  });
  it('expires new reservations while preserving a pending attempt and later verified fill',async()=>{
    const pending=reserve(order());const expired=expirePartialOrder(pending,Date.parse(input.expiresAt));
    expect(expired.status).toBe('expired');expect(expired.pending).toEqual(pending.pending);
    const filled=await complete(expired);expect(filled.status).toBe('expired');expect(filled.filledSharesRaw).toBe('3');
    expect(()=>reservePartialFill(order(),{attemptId:'late',buyer,sharesRaw:'3',preflightLedgerIndex:100},Date.parse(input.expiresAt))).toThrow(/expired/i);
  });
});
