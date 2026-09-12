import { afterEach, describe, expect, it } from 'vitest';
import { OfferService, type CreateOfferInput, type SettlementProof } from '../src/offers.js';
import { SqliteOfferStore } from '../src/offer-store.js';
import type { PositionSnapshot } from '../src/ledger-reader.js';

const seller = 'rLNzsCg1LPnytzSdf4hLk7inC58BFzuX6J';
const buyer = 'rJDP7VqdEJSq4UyUavaXp2m8wfyWLADCCs';
const start = Date.parse('2026-09-12T10:00:00.000Z');
const input: CreateOfferInput = {networkId:4001,vaultId:'A'.repeat(64),shareMptId:'B'.repeat(48),seller,sharesRaw:'9007199254740993',priceAsset:{currency:'XRP'},priceDrops:'950000',expiresAt:'2026-09-12T11:00:00.000Z'};
function position(time = start): PositionSnapshot {
  return {networkId:4001,vaultId:input.vaultId,shareMptId:input.shareMptId,holderAddress:seller,ledger:{hash:'C'.repeat(64),index:100,ageSeconds:2,readAt:new Date(time).toISOString()},heldSharesRaw:input.sharesRaw,totalSharesRaw:'9223372036854775807',assetsTotalDrops:'1e11',assetsAvailableDrops:'1000000',lossUnrealizedDrops:'0',shareScale:0,vault:{},issuance:{},holder:{},broker:null,loan:null};
}
const stores: SqliteOfferStore[] = [];
afterEach(() => { for (const store of stores.splice(0)) store.close(); });
function fixture(overrides: Partial<ConstructorParameters<typeof OfferService>[1]> = {}) {
  const store = new SqliteOfferStore(':memory:'); stores.push(store);
  let seq = 0;
  const service = new OfferService(store,{readPosition:async () => position(),now:()=>start,id:()=>`test-${++seq}`,...overrides});
  return {store,service};
}
function proof(attemptId:string): SettlementProof {
  return {attemptId,networkId:4001,transactionHash:'D'.repeat(64),ledgerHash:'E'.repeat(64),ledgerIndex:101,
    shares:{from:seller,to:buyer,shareMptId:input.shareMptId,sharesRaw:input.sharesRaw},payment:{from:buyer,to:seller,asset:{currency:'XRP'},drops:input.priceDrops}};
}

describe('local offer lifecycle', () => {
  it('publishes discoverable exact-string amounts and cancels only as seller', () => {
    const {service} = fixture(); const draft=service.createDraft(input);
    expect(draft.state).toBe('draft'); expect(draft.sharesRaw).toBe('9007199254740993');
    expect(service.list({state:'open'})).toEqual([]);
    expect(() => service.publish(draft.id,buyer)).toThrow(/seller/i);
    expect(service.publish(draft.id,seller)).toMatchObject({state:'open',revision:1});
    expect(service.list({state:'open',seller,vaultId:input.vaultId})).toHaveLength(1);
    expect(() => service.cancel(draft.id,buyer)).toThrow(/seller/i);
    expect(service.cancel(draft.id,seller).state).toBe('cancelled');
    expect(() => service.publish(draft.id,seller)).toThrow(/state|draft/i);
    expect(service.cancel(draft.id,seller).revision).toBe(2);
  });
  it.each([
    {networkId:1}, {sharesRaw:'0'}, {sharesRaw:'9223372036854775808'}, {sharesRaw:1}, {sharesRaw:'1e3'},
    {priceDrops:'0'}, {priceDrops:'100000000000000001'}, {priceDrops:'0.5'}, {priceAsset:{currency:'USD'}},
    {priceAsset:{currency:'XRP',issuer:seller}}, {seller:'invalid'}, {vaultId:'bad'}, {shareMptId:'C'.repeat(64)},
    {expiresAt:'2026-09-12'}, {expiresAt:'2026-09-12T10:00:00.000Z'}, {expiresAt:'2026-09-12T11:00:00+00:00'},
    {unknown:true}, {state:'open'},
  ])('rejects malformed draft data %j', patch => {
    const {service} = fixture(); expect(() => service.createDraft({...input,...patch})).toThrow();
    expect(service.list()).toHaveLength(0);
  });
  it('expires draft/open offers at exact expiry and persists expiry', () => {
    let now=start; const {service,store}=fixture({now:()=>now});
    const draft=service.createDraft(input); const open=service.createDraft(input); service.publish(open.id,seller);
    now=Date.parse(input.expiresAt);
    expect(service.list({state:'open'})).toEqual([]);
    expect(service.get(draft.id)?.state).toBe('expired');
    expect(store.get(open.id)?.state).toBe('expired');
    expect(() => service.publish(draft.id,seller)).toThrow();
  });
  it('checks current ledger ownership and records one exclusive settlement attempt', async () => {
    const calls:unknown[]=[]; const {service}=fixture({readPosition:async query => {calls.push(query); return position();}});
    const offer=service.createDraft(input); service.publish(offer.id,seller);
    const result=await service.prepareSettlement(offer.id,buyer);
    expect(calls).toEqual([{vaultId:input.vaultId,holder:seller}]);
    expect(result).toMatchObject({state:'settling',settlement:{buyer,ledger:{index:100}}});
    expect(() => service.cancel(offer.id,seller)).toThrow(/settling|state/i);
    await expect(service.prepareSettlement(offer.id,buyer)).rejects.toThrow(/open|state/i);
  });
  it.each([
    {networkId:1}, {vaultId:'F'.repeat(64)}, {shareMptId:'F'.repeat(48)}, {holderAddress:buyer},
    {heldSharesRaw:'1'}, {heldSharesRaw:'1e20'}, {heldSharesRaw:'9223372036854775808'},
    {totalSharesRaw:'1'}, {ledger:{hash:'bad',index:100,ageSeconds:0,readAt:new Date(start).toISOString()}},
    {ledger:{hash:'C'.repeat(64),index:100,ageSeconds:31,readAt:new Date(start).toISOString()}},
    {ledger:{hash:'C'.repeat(64),index:100,ageSeconds:0,readAt:new Date(start+1000).toISOString()}},
    {ledger:{hash:'C'.repeat(64),index:100,ageSeconds:0,readAt:'bad'}},
  ])('fails closed on unsuitable ownership snapshot %j', async patch => {
    const {service}=fixture({readPosition:async()=>({...position(),...patch}) as PositionSnapshot});
    const draft=service.createDraft(input);service.publish(draft.id,seller);
    await expect(service.prepareSettlement(draft.id,buyer)).rejects.toThrow();
    expect(service.get(draft.id)?.state).toBe('open');
  });
  it('rejects self acceptance and invalid buyers before reading', async () => {
    let reads=0; const {service}=fixture({readPosition:async()=>{reads++;return position();}});
    const offer=service.createDraft(input);service.publish(offer.id,seller);
    await expect(service.prepareSettlement(offer.id,seller)).rejects.toThrow();
    await expect(service.prepareSettlement(offer.id,'bad')).rejects.toThrow();expect(reads).toBe(0);
  });
  it('honors cancellation while the ledger read is pending', async () => {
    let release!:(value:PositionSnapshot)=>void;
    const {service}=fixture({readPosition:()=>new Promise(resolve=>{release=resolve;})});
    const offer=service.createDraft(input);service.publish(offer.id,seller);
    const pending=service.prepareSettlement(offer.id,buyer);service.cancel(offer.id,seller);release(position());
    await expect(pending).rejects.toThrow(/changed|state|open/i);
    expect(service.get(offer.id)?.state).toBe('cancelled');
  });
  it('rechecks expiry after asynchronous ledger reads', async () => {
    let now=start; const {service}=fixture({now:()=>now,readPosition:async()=>{now=Date.parse(input.expiresAt);return position(now);}});
    const offer=service.createDraft(input);service.publish(offer.id,seller);
    await expect(service.prepareSettlement(offer.id,buyer)).rejects.toThrow(/expired|changed|state/i);
    expect(service.get(offer.id)?.state).toBe('expired');
  });
  it('retains settling across expiry and verifier/network uncertainty', async () => {
    let now=start; const {service}=fixture({now:()=>now}); const offer=service.createDraft(input);service.publish(offer.id,seller);
    const pending=await service.prepareSettlement(offer.id,buyer);now=Date.parse(input.expiresAt)+1;
    expect(service.get(offer.id)?.state).toBe('settling');
    await expect(service.reconcileSettlement(offer.id,pending.settlement!.id)).rejects.toThrow(/verif/i);
    expect(service.get(offer.id)?.state).toBe('settling');
  });
  it('settles only from trusted adapter evidence of both exact exchange legs, idempotently', async () => {
    const {service}=fixture({verifySettlement:async (_offer,attempt)=>proof(attempt.id)});
    const draft=service.createDraft(input);service.publish(draft.id,seller);
    const pending=await service.prepareSettlement(draft.id,buyer);const attempt=pending.settlement!.id;
    expect((await service.reconcileSettlement(draft.id,attempt)).state).toBe('settled');
    expect((await service.reconcileSettlement(draft.id,attempt)).revision).toBe(3);
    await expect(service.reconcileSettlement(draft.id,'other')).rejects.toThrow(/attempt/i);
  });
  it('keeps pending for missing or mismatched verification and never trusts outer success', async () => {
    let result:unknown=null;
    const {service}=fixture({verifySettlement:async()=>result as SettlementProof|null});
    const draft=service.createDraft(input);service.publish(draft.id,seller);
    const pending=await service.prepareSettlement(draft.id,buyer);const attempt=pending.settlement!.id;
    expect((await service.reconcileSettlement(draft.id,attempt)).state).toBe('settling');
    result={validated:true,resultCode:'tesSUCCESS'};
    await expect(service.reconcileSettlement(draft.id,attempt)).rejects.toThrow();
    result={...proof(attempt),payment:{...proof(attempt).payment,drops:'1'}};
    await expect(service.reconcileSettlement(draft.id,attempt)).rejects.toThrow();
    expect(service.get(draft.id)?.state).toBe('settling');
  });
});

it('rejects proof from the preflight ledger or an earlier ledger', async () => {
  let ledgerIndex=100;
  const {service}=fixture({verifySettlement:async(_offer,attempt)=>({...proof(attempt.id),ledgerIndex})});
  const draft=service.createDraft(input);service.publish(draft.id,seller);const pending=await service.prepareSettlement(draft.id,buyer);
  await expect(service.reconcileSettlement(draft.id,pending.settlement!.id)).rejects.toThrow(/ledger/i);
  ledgerIndex=99;await expect(service.reconcileSettlement(draft.id,pending.settlement!.id)).rejects.toThrow(/ledger/i);
  expect(service.get(draft.id)?.state).toBe('settling');
});
it('counts time spent waiting for ownership reads against freshness', async () => {
  let now=start;const {service}=fixture({now:()=>now,readPosition:async()=>{now+=29_000;return position();}});
  const draft=service.createDraft(input);service.publish(draft.id,seller);
  await expect(service.prepareSettlement(draft.id,buyer)).rejects.toThrow(/stale/i);
});
it('does not publish if expiry is crossed between reading the offer and writing the transition', () => {
  const expiry=Date.parse(input.expiresAt);let calls=0;
  const {service}=fixture({now:()=>++calls<3?start:expiry});
  const draft=service.createDraft(input);
  expect(()=>service.publish(draft.id,seller)).toThrow(/expired/i);
  expect(service.get(draft.id)?.state).toBe('expired');
});
