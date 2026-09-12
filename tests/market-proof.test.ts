import { describe, expect, it } from 'vitest';
import { Wallet, signMultiBatch, decode, hashes, type Batch, type Transaction } from 'xrpl';
import { verifyBatchSettlement } from '../src/market-ledger.js';
import { buildSaleBatch } from '../src/settlement.js';
import type { Offer } from '../src/offers.js';
import type { StoredAttempt } from '../src/market-types.js';

const seller=Wallet.generate(),buyer=Wallet.generate();
const offer:Offer={id:'offer-1',revision:2,state:'settling',networkId:4001,seller:seller.address,vaultId:'A'.repeat(64),shareMptId:'B'.repeat(48),sharesRaw:'1000',priceAsset:{currency:'XRP'},priceDrops:'950',expiresAt:'2026-12-01T01:00:00.000Z',createdAt:'2026-12-01T00:00:00.000Z',updatedAt:'2026-12-01T00:01:00.000Z',settlement:{id:'attempt-1',buyer:buyer.address,preparedAt:'2026-12-01T00:01:00.000Z',ledger:{hash:'C'.repeat(64),index:100,ageSeconds:1,readAt:'2026-12-01T00:01:00.000Z'},proof:null}};
function fixture() {
  const batch=buildSaleBatch(seller.address,buyer.address,offer.shareMptId,offer.priceDrops,offer.sharesRaw) as Batch;
  Object.assign(batch,{Sequence:10,NetworkID:4001,Fee:'100',LastLedgerSequence:120});
  batch.RawTransactions.forEach((raw,i)=>Object.assign(raw.RawTransaction,{Sequence:i===0?20:11,NetworkID:4001,SigningPubKey:'',Fee:'0'}));
  signMultiBatch(buyer,batch);const signed=seller.sign(batch);const full=decode(signed.tx_blob);
  const attempt:StoredAttempt={id:'attempt-1',offerId:offer.id,buyer:buyer.address,revision:3,status:'pending',batch:full,blob:signed.tx_blob,hash:signed.hash,lastLedgerSequence:120,message:null};
  const ledgerHash='D'.repeat(64);
  const results:Record<string,Record<string,unknown>>={
    [signed.hash]:{hash:signed.hash,validated:true,ledger_index:101,tx_json:full,meta:{TransactionResult:'tesSUCCESS'}}
  };
  const innerHashes=batch.RawTransactions.map(raw=>hashes.hashSignedTx(raw.RawTransaction as Transaction));
  batch.RawTransactions.forEach((raw,index)=>{
    results[innerHashes[index]!]={hash:innerHashes[index],validated:true,ledger_index:101,tx_json:raw.RawTransaction,meta:{ParentBatchID:signed.hash,TransactionResult:'tesSUCCESS',delivered_amount:(raw.RawTransaction as {Amount:unknown}).Amount}};
  });
  const request=async (req:Record<string,unknown>):Promise<{result:unknown}>=>{
    if(req.command==='ledger')return {result:{validated:true,ledger_hash:ledgerHash,ledger_index:101,ledger:{ledger_hash:ledgerHash,ledger_index:'101'}}};
    const result=results[String(req.transaction)];if(!result)throw new Error('txnNotFound');return {result};
  };
  return {attempt,results,request,innerHashes};
}
describe('transaction-bound two-leg settlement proof',()=>{
  it('settles only exact validated inner transactions linked to the outer hash and ledger',async()=>{
    const f=fixture();expect(await verifyBatchSettlement(offer,f.attempt,f.request)).toMatchObject({status:'settled',proof:{attemptId:offer.settlement!.id,transactionHash:f.attempt.hash,ledgerIndex:101,payment:{drops:'950'},shares:{sharesRaw:'1000'}}});
  });
  it.each(['missing-leg','wrong-parent','wrong-ledger','unvalidated','wrong-delivery','outer-only','wrong-tx'])('fails closed for %s',async kind=>{
    const f=fixture();const first=f.results[f.innerHashes[0]!]!;
    if(kind==='missing-leg')delete f.results[f.innerHashes[1]!];
    if(kind==='wrong-parent')(first.meta as Record<string,unknown>).ParentBatchID='E'.repeat(64);
    if(kind==='wrong-ledger')first.ledger_index=102;
    if(kind==='unvalidated')first.validated=false;
    if(kind==='wrong-delivery')(first.meta as Record<string,unknown>).delivered_amount='949';
    if(kind==='outer-only'){delete f.results[f.innerHashes[0]!];delete f.results[f.innerHashes[1]!];}
    if(kind==='wrong-tx')first.tx_json={...(first.tx_json as object),Amount:'949'};
    expect((await verifyBatchSettlement(offer,f.attempt,f.request)).status).toBe('pending');
  });
  it('normalizes API v2 DeliverMax before hashing exact XRP and MPT inner Payments',async()=>{
    const f=fixture();
    for(const id of f.innerHashes){const tx=f.results[id]!.tx_json as Record<string,unknown>;f.results[id]!.tx_json={...tx,DeliverMax:tx.Amount};delete (f.results[id]!.tx_json as Record<string,unknown>).Amount;}
    expect((await verifyBatchSettlement(offer,f.attempt,f.request)).status).toBe('settled');
  });
  it('rejects conflicting Amount and DeliverMax instead of choosing either value',async()=>{
    const f=fixture();const tx=f.results[f.innerHashes[0]!]!.tx_json as Record<string,unknown>;
    tx.DeliverMax='951';
    expect((await verifyBatchSettlement(offer,f.attempt,f.request)).status).toBe('pending');
  });
  it('does not turn a different-price Batch into a proof for this offer',async()=>{
    const f=fixture();
    expect((await verifyBatchSettlement({...offer,priceDrops:'951'},f.attempt,f.request)).status).toBe('pending');
  });
  it('records a validated outer failure without claiming exchange or reopening',async()=>{
    const f=fixture();(f.results[f.attempt.hash!]!.meta as Record<string,unknown>).TransactionResult='tecINSUFFICIENT_FUNDS';
    expect(await verifyBatchSettlement(offer,f.attempt,f.request)).toMatchObject({status:'failed'});
  });
});
