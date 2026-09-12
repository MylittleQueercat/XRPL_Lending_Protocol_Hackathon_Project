import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, expect, it } from 'vitest';
import { SqliteOfferStore } from '../src/offer-store.js';
import { OfferService, type Offer } from '../src/offers.js';

const seller='rLNzsCg1LPnytzSdf4hLk7inC58BFzuX6J';
const dirs:string[]=[];const handles:SqliteOfferStore[]=[];
afterEach(()=>{for(const h of handles.splice(0))h.close();for(const dir of dirs.splice(0))rmSync(dir,{recursive:true,force:true});});
function path(){const dir=mkdtempSync(join(tmpdir(),'raise-offers-'));dirs.push(dir);return join(dir,'offers.sqlite');}
function open(file:string){const db=new SqliteOfferStore(file);handles.push(db);return db;}
function draft(store:SqliteOfferStore){return new OfferService(store,{readPosition:async()=>{throw new Error('not needed');},now:()=>Date.parse('2026-09-12T10:00:00.000Z')}).createDraft({networkId:4001,vaultId:'A'.repeat(64),shareMptId:'B'.repeat(48),seller,sharesRaw:'9223372036854775807',priceAsset:{currency:'XRP'},priceDrops:'100000000000000000',expiresAt:'2026-09-12T11:00:00.000Z'});}
it('durably preserves exact amounts and JSON through independent reopen',()=>{
  const file=path();const first=open(file);const offer=draft(first);first.close();const reopened=open(file);
  expect(reopened.get(offer.id)).toEqual(offer);expect(reopened.list({seller,vaultId:offer.vaultId,state:'draft'})).toEqual([offer]);
  const returned=reopened.get(offer.id)!;returned.priceDrops='1';expect(reopened.get(offer.id)?.priceDrops).toBe('100000000000000000');
});
it('rejects stale writes from separate SQLite connections without overwriting winner',()=>{
  const file=path();const one=open(file);const two=open(file);const offer=draft(one);const stale=two.get(offer.id)!;
  one.updateCAS({...offer,state:'open',revision:1},0);
  expect(()=>two.updateCAS({...stale,state:'cancelled',revision:1},0)).toThrow(/conflict|changed|revision/i);
  expect(two.get(offer.id)).toMatchObject({state:'open',revision:1});
});
it('rejects duplicate ids, revision jumps, immutable term changes and malformed rows',()=>{
  const store=open(path());const offer=draft(store);
  expect(()=>store.insert(offer)).toThrow();
  expect(()=>store.updateCAS({...offer,revision:2},0)).toThrow(/revision/i);
  expect(()=>store.updateCAS({...offer,state:'open',priceDrops:'1',revision:1},0)).toThrow(/immutable|terms/i);
  expect(()=>store.insert({...offer,id:'bad',sharesRaw:'1.5'})).toThrow();
  expect(()=>store.insert({...offer,id:'bad2',state:'settled'} as Offer)).toThrow();
});
it('fails closed when persisted JSON is corrupted',()=>{
  const file=path();const store=open(file);const offer=draft(store);const raw=new DatabaseSync(file);
  try{raw.prepare('UPDATE offers SET data = ? WHERE id = ?').run('{"broken":true}',offer.id);}finally{raw.close();}
  expect(()=>store.get(offer.id)).toThrow(/corrupt|invalid/i);expect(()=>store.list()).toThrow();
});
it('rejects unsupported schema versions without overwriting the file',()=>{
  const file=path();const raw=new DatabaseSync(file);raw.exec('PRAGMA user_version=99');raw.close();
  expect(()=>new SqliteOfferStore(file)).toThrow(/schema/i);
  const verify=new DatabaseSync(file);try{expect(verify.prepare('PRAGMA user_version').get()?.user_version).toBe(99);}finally{verify.close();}
});
it('allows only one concurrent preparation across two services and SQLite connections',async()=>{
  const file=path();const one=open(file);const two=open(file);const offer=draft(one);
  const time=Date.parse('2026-09-12T10:00:00.000Z');
  const snapshot={networkId:4001,vaultId:offer.vaultId,shareMptId:offer.shareMptId,holderAddress:seller,ledger:{hash:'C'.repeat(64),index:100,ageSeconds:0,readAt:new Date(time).toISOString()},heldSharesRaw:offer.sharesRaw,totalSharesRaw:offer.sharesRaw,assetsTotalDrops:'1',assetsAvailableDrops:'1',lossUnrealizedDrops:'0',shareScale:0,vault:{},issuance:{},holder:{},broker:null,loan:null};
  const releases:Array<()=>void>=[];
  const readPosition=()=>new Promise<typeof snapshot>(resolve=>releases.push(()=>resolve(snapshot)));
  const first=new OfferService(one,{readPosition,now:()=>time});const second=new OfferService(two,{readPosition,now:()=>time});
  first.publish(offer.id,seller);
  const requests=[first.prepareSettlement(offer.id,'rJDP7VqdEJSq4UyUavaXp2m8wfyWLADCCs'),second.prepareSettlement(offer.id,'rJDP7VqdEJSq4UyUavaXp2m8wfyWLADCCs')];
  releases.forEach(release=>release());const results=await Promise.allSettled(requests);
  expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1);
  expect(results.filter(result=>result.status==='rejected')).toHaveLength(1);
  expect(one.get(offer.id)).toEqual(two.get(offer.id));expect(one.get(offer.id)?.state).toBe('settling');
});
it('rejects reopening terminal offers through the persistence boundary',()=>{
  const store=open(path());const offer=draft(store);const cancelled={...offer,revision:1,state:'cancelled' as const};
  store.updateCAS(cancelled,0);
  expect(()=>store.updateCAS({...cancelled,revision:2,state:'open'},1)).toThrow(/transition|state/i);
});
