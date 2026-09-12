import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Wallet, signMultiBatch, decode, hashes, type Batch, type Transaction } from 'xrpl';
import { SqlitePartialStore } from '../src/partial-store.js';
import { bindPartialTransaction, buildPartialChildOffer, cancelPartialOrder, createPartialOrder, reconcilePartialFill, reservePartialFill, type PartialOrder } from '../src/partial-fills.js';
import { buildSaleBatch } from '../src/settlement.js';
import { verifyBatchSettlement } from '../src/market-ledger.js';
import type { StoredAttempt } from '../src/market-types.js';

const seller=Wallet.generate(),buyer=Wallet.generate();
const now=Date.parse('2026-09-12T10:00:00.000Z');
const ledger={hash:'E'.repeat(64),index:100,ageSeconds:1,readAt:new Date(now+1000).toISOString()};
function create(id='order-1'):PartialOrder{return createPartialOrder(id,{networkId:4001,vaultId:'A'.repeat(64),shareMptId:'B'.repeat(48),seller:seller.address,sharesRaw:'10',priceAsset:{currency:'XRP'},priceDrops:'7',expiresAt:new Date(now+3600000).toISOString()},now);}
function reserve(state:PartialOrder,id='attempt-1'){return reservePartialFill(state,{attemptId:id,buyer:buyer.address,sharesRaw:'3',preflightLedgerIndex:100},now+1000);}
const cleanup:Array<()=>void>=[];
afterEach(()=>cleanup.splice(0).reverse().forEach(fn=>fn()));
function database(){const dir=mkdtempSync(join(tmpdir(),'raise-partial-'));cleanup.push(()=>rmSync(dir,{recursive:true,force:true}));return join(dir,'partial.sqlite');}
function store(path:string){const db=new SqlitePartialStore(path);cleanup.push(()=>db.close());return db;}
describe('partial-order persistence prototype',()=>{
  it('allows only one reservation from two independent SQLite connections',()=>{
    const path=database(),first=store(path),second=store(path);first.insert(create());
    const a=first.get('order-1')!,b=second.get('order-1')!;
    first.updateCAS(reserve(a),a.revision);
    expect(()=>second.updateCAS(reserve(b,'attempt-2'),b.revision)).toThrow(/revision|conflict/i);
    expect(second.get('order-1')!.pending!.attemptId).toBe('attempt-1');
  });
  it('preserves pending exact hash on reopening and blocks reuse across other orders',()=>{
    const path=database(),first=store(path);first.insert(create());
    const reserved=reserve(first.get('order-1')!);first.updateCAS(reserved,0);
    const bound=bindPartialTransaction(reserved,'attempt-1','C'.repeat(64));first.updateCAS(bound,1);
    const reopened=store(path);expect(reopened.get('order-1')).toEqual(bound);
    reopened.insert(create('order-2'));
    expect(()=>reopened.updateCAS(reserve(create('order-2')),0)).toThrow(/attempt|UNIQUE|used/i);
    const other=reserve(create('order-2'),'attempt-2');reopened.updateCAS(other,0);
    expect(()=>reopened.updateCAS(bindPartialTransaction(other,'attempt-2','C'.repeat(64)),1)).toThrow(/hash|UNIQUE|used/i);
    expect(reopened.get('order-2')!.pending!.transactionHash).toBeNull();
  });
  it('rejects changed immutable terms and tampered accounting before persistence',()=>{
    const db=store(database());const initial=create();db.insert(initial);
    expect(()=>db.updateCAS({...reserve(initial),terms:{...initial.terms,priceDrops:'8'}},0)).toThrow(/immutable|terms/i);
    expect(()=>db.updateCAS({...reserve(initial),filledSharesRaw:'3'},0)).toThrow(/accounting|history/i);
    expect(db.get(initial.id)).toEqual(initial);
  });
  it('does not let a stale completed fill overwrite a concurrent cancellation',async()=>{
    const db=store(database());const initial=create();db.insert(initial);const pending=reserve(initial);db.updateCAS(pending,0);const bound=bindPartialTransaction(pending,'attempt-1','C'.repeat(64));db.updateCAS(bound,1);
    const result=await reconcilePartialFill(bound,{attemptId:'attempt-1',transactionHash:'C'.repeat(64)},{verify:async c=>({attemptId:c.attemptId,networkId:4001,transactionHash:c.transactionHash,ledgerHash:'D'.repeat(64),ledgerIndex:101,shares:{from:c.seller,to:c.buyer,shareMptId:c.shareMptId,sharesRaw:c.sharesRaw},payment:{from:c.buyer,to:c.seller,asset:{currency:'XRP'},drops:c.priceDrops}})});
    const cancelled=cancelPartialOrder(bound,seller.address);db.updateCAS(cancelled,2);
    expect(()=>db.updateCAS(result,2)).toThrow(/revision|conflict/i);
    expect(db.get(initial.id)!.status).toBe('cancelled');expect(db.get(initial.id)!.pending).not.toBeNull();
  });
  it('builds exact child terms, signs a real Batch fixture, verifies both legs, and persists one partial fill',async()=>{
    const path=database(),db=store(path);const initial=create();db.insert(initial);const reserved=reserve(initial);db.updateCAS(reserved,0);
    const child=buildPartialChildOffer(reserved,ledger);
    expect(child).toMatchObject({id:initial.id,sharesRaw:'3',priceDrops:'2',state:'settling',settlement:{id:'attempt-1',buyer:buyer.address}});
    const batch=buildSaleBatch(child.seller,buyer.address,child.shareMptId,child.priceDrops,child.sharesRaw) as Batch;
    Object.assign(batch,{Sequence:10,NetworkID:4001,Fee:'100',LastLedgerSequence:120});
    batch.RawTransactions.forEach((raw,i)=>Object.assign(raw.RawTransaction,{Sequence:i===0?20:11,NetworkID:4001,Fee:'0',SigningPubKey:''}));
    signMultiBatch(buyer,batch);const signed=seller.sign(batch);const decoded=decode(signed.tx_blob);
    const bound=bindPartialTransaction(reserved,'attempt-1',signed.hash);db.updateCAS(bound,1);
    const attempt:StoredAttempt={id:'attempt-1',offerId:child.id,buyer:buyer.address,revision:2,status:'pending',batch:decoded,blob:signed.tx_blob,hash:signed.hash,lastLedgerSequence:120,message:null};
    const responses:Record<string,unknown>={[signed.hash]:{validated:true,hash:signed.hash,ledger_index:101,tx_json:decoded,meta:{TransactionResult:'tesSUCCESS'}}};
    for(const raw of batch.RawTransactions){const inner=raw.RawTransaction as Transaction & {Amount:unknown};const id=hashes.hashSignedTx(inner);const tx={...inner,DeliverMax:inner.Amount} as Record<string,unknown>;delete tx.Amount;responses[id]={validated:true,hash:id,ledger_index:101,tx_json:tx,meta:{TransactionResult:'tesSUCCESS',ParentBatchID:signed.hash,delivered_amount:inner.Amount}};}
    const verify=async()=>{const result=await verifyBatchSettlement(child,attempt,async request=>({result:request.command==='ledger'?{validated:true,ledger_hash:'D'.repeat(64),ledger_index:101}:responses[String(request.transaction)]}));return result.status==='settled'?result.proof:null;};
    const settled=await reconcilePartialFill(bound,{attemptId:'attempt-1',transactionHash:signed.hash},{verify});db.updateCAS(settled,2);
    const restarted=store(path);expect(restarted.get(initial.id)).toMatchObject({status:'open',filledSharesRaw:'3',receivedDrops:'2',pending:null});
    const replay=await reconcilePartialFill(restarted.get(initial.id)!,{attemptId:'attempt-1',transactionHash:signed.hash},{verify});expect(replay.revision).toBe(settled.revision);
    expect(()=>db.updateCAS(replay,settled.revision)).toThrow(/revision/i);
    expect(()=>buildPartialChildOffer(reserved,{...ledger,index:101})).toThrow(/preflight|ledger/i);
  });
});
