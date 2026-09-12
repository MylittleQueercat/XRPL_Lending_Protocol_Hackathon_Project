import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Wallet, signMultiBatch, type Batch } from 'xrpl';
import { MarketService, type MarketGateway } from '../src/market-service.js';
import { MarketStore } from '../src/market-store.js';
import { SqliteOfferStore } from '../src/offer-store.js';
import { buildSaleBatch } from '../src/settlement.js';
import type { CreateOfferInput, Offer } from '../src/offers.js';
import type { PositionSnapshot } from '../src/ledger-reader.js';

const seller=Wallet.generate(),buyer=Wallet.generate(),outsider=Wallet.generate();
const now=Date.now();
const input:CreateOfferInput={networkId:4001,vaultId:'A'.repeat(64),shareMptId:'B'.repeat(48),seller:seller.address,sharesRaw:'1000',priceAsset:{currency:'XRP'},priceDrops:'950',expiresAt:new Date(now+3600000).toISOString()};
const position:PositionSnapshot={networkId:4001,vaultId:input.vaultId,shareMptId:input.shareMptId,holderAddress:seller.address,ledger:{hash:'C'.repeat(64),index:100,ageSeconds:1,readAt:new Date(now).toISOString()},heldSharesRaw:'1000',totalSharesRaw:'1000',assetsTotalDrops:'1000',assetsAvailableDrops:'0',lossUnrealizedDrops:'0',shareScale:0,vault:{},issuance:{},holder:{},broker:null,loan:null};
function prepared(offer:Offer):Record<string,unknown> {
  const batch=buildSaleBatch(offer.seller,offer.settlement!.buyer,offer.shareMptId,offer.priceDrops,offer.sharesRaw) as Batch;
  Object.assign(batch,{Sequence:10,NetworkID:4001,LastLedgerSequence:120,Fee:'100'});
  batch.RawTransactions.forEach((r,i)=>Object.assign(r.RawTransaction,{Sequence:i===0?20:11,NetworkID:4001,Fee:'0',SigningPubKey:''}));
  return batch as unknown as Record<string,unknown>;
}
const cleanup:Array<()=>void>=[];
afterEach(()=>cleanup.splice(0).reverse().forEach(fn=>fn()));
function setup(gatewayPatch:Partial<MarketGateway>={},path=':memory:') {
  const store=new MarketStore(path),offers=new SqliteOfferStore(path); cleanup.push(()=>store.close(),()=>offers.close());
  const gateway:MarketGateway={checkMaster:async()=>{},readPosition:async()=>structuredClone(position),prepareBatch:async offer=>prepared(offer),submit:vi.fn(async()=>{}),verify:async()=>({status:'pending',message:'Awaiting validation.'}),...gatewayPatch};
  const service=new MarketService(store,offers,gateway,()=>now);
  return {service,gateway,store};
}
async function prepare(service:MarketService) {
  const created=await service.execute(seller.address,{type:'create',input});
  const id=created.offers[0]!.id;
  const ready=await service.execute(buyer.address,{type:'prepare',offerId:id});
  return {id,attempt:ready.attempts[0]!};
}
async function buyerSigns(service:MarketService) {
  const {id,attempt}=await prepare(service); const batch=structuredClone(attempt.batch) as unknown as Batch;
  signMultiBatch(buyer,batch);
  const ready=await service.execute(buyer.address,{type:'buyer-sign',offerId:id,batch:batch as unknown as Record<string,unknown>});
  return {id,blob:seller.sign(ready.attempts[0]!.batch as unknown as Batch).tx_blob};
}
describe('shared durable marketplace coordinator',()=>{
  it('shares offers across processes and enforces actor ownership',async()=>{
    const dir=mkdtempSync(join(tmpdir(),'raise-market-'));cleanup.push(()=>rmSync(dir,{recursive:true,force:true}));
    const path=join(dir,'market.sqlite');const first=setup({},path),second=setup({},path);
    await first.service.execute(seller.address,{type:'create',input});
    const id=second.service.snapshot().offers[0]!.id;
    await expect(second.service.execute(buyer.address,{type:'cancel',offerId:id})).rejects.toThrow(/seller/i);
    await second.service.execute(seller.address,{type:'cancel',offerId:id});
    expect(first.service.snapshot().offers[0]!.state).toBe('cancelled');
  });
  it('only one concurrent buyer can reserve the exact offer',async()=>{
    const {service}=setup();const created=await service.execute(seller.address,{type:'create',input});const id=created.offers[0]!.id;
    const results=await Promise.allSettled([service.execute(buyer.address,{type:'prepare',offerId:id}),service.execute(outsider.address,{type:'prepare',offerId:id})]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    expect(service.snapshot().attempts).toHaveLength(1);
  });
  it('rejects edited terms and wrong-account buyer signatures',async()=>{
    const {service}=setup();const {id,attempt}=await prepare(service);
    const batch=structuredClone(attempt.batch) as unknown as Batch;
    batch.RawTransactions[0]!.RawTransaction.Account=outsider.address;signMultiBatch(outsider,batch);
    await expect(service.execute(buyer.address,{type:'buyer-sign',offerId:id,batch:batch as unknown as Record<string,unknown>})).rejects.toThrow(/terms|signature/i);
    expect(service.snapshot().attempts[0]!.status).toBe('awaiting-buyer');
  });
  it('persists exact hash before network submission and never resubmits an ambiguous attempt',async()=>{
    const {service,gateway,store}=setup({submit:vi.fn(async()=>{
      expect(store.getAttempt(id)?.hash).toMatch(/^[A-F0-9]{64}$/);
      expect(store.getAttempt(id)?.status).toBe('submitting');
      throw new Error('socket lost');
    })});
    const {id,blob}=await buyerSigns(service);
    const result=await service.execute(seller.address,{type:'seller-submit',offerId:id,txBlob:blob});
    expect(result.attempts[0]).toMatchObject({status:'pending'});expect(result.offers[0]!.state).toBe('settling');
    await service.execute(seller.address,{type:'seller-submit',offerId:id,txBlob:blob});
    await service.execute(buyer.address,{type:'reconcile',offerId:id});
    expect(gateway.submit).toHaveBeenCalledTimes(1);
  });
  it('allows only one broadcast when two seller requests arrive together',async()=>{
    let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
    const {service,gateway}=setup({submit:vi.fn(async()=>{await gate;})});const {id,blob}=await buyerSigns(service);
    const first=service.execute(seller.address,{type:'seller-submit',offerId:id,txBlob:blob});
    const second=service.execute(seller.address,{type:'seller-submit',offerId:id,txBlob:blob});
    release();await Promise.all([first,second]);
    expect(gateway.submit).toHaveBeenCalledTimes(1);expect(service.snapshot().attempts[0]!.status).toBe('pending');
  });
  it('rejects an outer transaction changed after the buyer signature',async()=>{
    const {service}=setup();const {id,attempt}=await prepare(service);
    const batch=attempt.batch as unknown as Batch;signMultiBatch(buyer,batch);
    const ready=await service.execute(buyer.address,{type:'buyer-sign',offerId:id,batch:batch as unknown as Record<string,unknown>});
    const changed=ready.attempts[0]!.batch as unknown as Batch;changed.Fee='101';
    await expect(service.execute(seller.address,{type:'seller-submit',offerId:id,txBlob:seller.sign(changed).tx_blob})).rejects.toThrow(/terms/i);
  });
  it('keeps pending and exact hash across restart and permits read-only recovery',async()=>{
    const dir=mkdtempSync(join(tmpdir(),'raise-market-'));cleanup.push(()=>rmSync(dir,{recursive:true,force:true}));const path=join(dir,'market.sqlite');
    const first=setup({submit:async()=>{throw new Error('timeout');}},path);const {id,blob}=await buyerSigns(first.service);
    await first.service.execute(seller.address,{type:'seller-submit',offerId:id,txBlob:blob});
    const saved=first.service.snapshot().attempts[0]!;const second=setup({},path);
    const result=await second.service.execute(buyer.address,{type:'reconcile',offerId:id});
    expect(result.attempts[0]!.hash).toBe(saved.hash);expect(result.attempts[0]!.status).toBe('pending');
    expect(second.gateway.submit).not.toHaveBeenCalled();
  });
  it('repairs a crash after verified offer settlement without losing the durable proof',async()=>{
    const {service,store,gateway}=setup();const {id,blob}=await buyerSigns(service);
    await service.execute(seller.address,{type:'seller-submit',offerId:id,txBlob:blob});
    const attempt=store.getAttempt(id)!;
    gateway.verify=async()=>({status:'settled',proof:{attemptId:attempt.id,networkId:4001,transactionHash:attempt.hash!,ledgerHash:'D'.repeat(64),ledgerIndex:101,shares:{from:seller.address,to:buyer.address,shareMptId:input.shareMptId,sharesRaw:input.sharesRaw},payment:{from:buyer.address,to:seller.address,asset:{currency:'XRP'},drops:input.priceDrops}}});
    const original=store.updateAttempt.bind(store);
    const failure=vi.spyOn(store,'updateAttempt').mockImplementation((next,revision)=>{if(next.status==='settled')throw new Error('simulated stop after offer write');original(next,revision);});
    await expect(service.execute(buyer.address,{type:'reconcile',offerId:id})).rejects.toThrow(/simulated/);
    failure.mockRestore();expect(service.snapshot().offers[0]!.state).toBe('settled');
    gateway.verify=async()=>({status:'pending',message:'History unavailable'});
    await service.execute(buyer.address,{type:'reconcile',offerId:id});
    expect(service.snapshot().attempts[0]!.status).toBe('settled');
  });
  it('rejects disabled-master accounts before any business mutation',async()=>{
    const {service}=setup({checkMaster:async()=>{throw new Error('Master key disabled.');}});
    await expect(service.execute(seller.address,{type:'create',input})).rejects.toThrow(/disabled/i);
    expect(service.snapshot().offers).toEqual([]);
  });
});
