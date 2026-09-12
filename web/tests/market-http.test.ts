import { afterEach, describe, expect, it } from 'vitest';
import { Wallet } from 'xrpl';
import { sign } from 'ripple-keypairs';
import { MarketAuth } from '../../src/market-auth.js';
import { MarketStore } from '../../src/market-store.js';
import { MarketService } from '../../src/market-service.js';
import { SqliteOfferStore } from '../../src/offer-store.js';
import { handleMarket, dispatchMarket } from '../src/lib/server/market-http';
const origin='http://localhost:3000';
const cleanup:Array<()=>void>=[];
afterEach(()=>cleanup.splice(0).forEach(fn=>fn()));
function fixture(){
  const store=new MarketStore(':memory:'),offers=new SqliteOfferStore(':memory:');cleanup.push(()=>store.close(),()=>offers.close());
  const service=new MarketService(store,offers,{checkMaster:async()=>{},readPosition:async()=>{throw new Error('Not required');},prepareBatch:async()=>{throw new Error('Not required');},submit:async()=>{throw new Error('Not allowed');},verify:async()=>({status:'pending',message:'Unknown'})});
  return {origin,auth:new MarketAuth(store,origin),service};
}
function request(body:unknown,headers:Record<string,string>={}){return new Request(`${origin}/api/market`,{method:'POST',headers:{origin,'content-type':'application/json',...headers},body:JSON.stringify(body)});}
describe('shared market HTTP trust boundary',()=>{
  it('rejects foreign origins and missing signatures without mutations',async()=>{
    const runtime=fixture();expect((await handleMarket(request({}, {origin:'http://evil.invalid'}),runtime)).status).toBe(403);
    expect((await handleMarket(request({}),runtime)).status).toBe(401);expect(runtime.service.snapshot().offers).toEqual([]);
  });
  it('accepts a same-host GET without Origin when Next uses an internal request hostname',async()=>{
    const runtime=fixture();
    const read=new Request('http://127.0.0.1:3000/api/market',{headers:{host:'localhost:3000'}});
    expect((await handleMarket(read,runtime)).status).toBe(200);
    const foreign=new Request('http://localhost:3000/api/market',{headers:{host:'untrusted.invalid','x-forwarded-host':'localhost:3000'}});
    expect((await handleMarket(foreign,runtime)).status).toBe(403);
  });
  it('returns sanitized JSON if runtime initialization fails',async()=>{
    const response=await dispatchMarket(new Request(`${origin}/api/market`),()=>{throw new Error('private local filesystem path');});
    expect(response.status).toBe(503);expect(await response.json()).toEqual({error:'Shared marketplace service is unavailable.'});
  });
  it('limits bodies before accepting a challenge',async()=>{
    expect((await handleMarket(request({account:'x'.repeat(50000),action:{}}),fixture(),true)).status).toBe(400);
  });
  it('lets two clients see a signed published offer and rejects replay',async()=>{
    const runtime=fixture(),seller=Wallet.generate();
    const action={type:'create',input:{networkId:4001,vaultId:'A'.repeat(64),shareMptId:'B'.repeat(48),seller:seller.address,sharesRaw:'1000',priceAsset:{currency:'XRP'},priceDrops:'950',expiresAt:new Date(Date.now()+3600000).toISOString()}};
    const challengeResponse=await handleMarket(request({account:seller.address,action}),runtime,true);
    expect(challengeResponse.status).toBe(200);const challenge=await challengeResponse.json();
    const envelope={challengeId:challenge.id,publicKey:seller.publicKey,signature:sign(Buffer.from(challenge.message).toString('hex'),seller.privateKey)};
    expect((await handleMarket(request(envelope),runtime)).status).toBe(200);
    const secondClient=await handleMarket(new Request(`${origin}/api/market`),runtime);
    expect((await secondClient.json()).offers[0]).toMatchObject({seller:seller.address,state:'open',priceDrops:'950'});
    expect((await handleMarket(request(envelope),runtime)).status).toBe(401);
    expect(runtime.service.snapshot().offers).toHaveLength(1);
  });
});
