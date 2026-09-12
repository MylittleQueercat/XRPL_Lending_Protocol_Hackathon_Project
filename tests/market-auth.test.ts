import { afterEach, describe, expect, it } from 'vitest';
import { Wallet } from 'xrpl';
import { sign } from 'ripple-keypairs';
import { MarketAuth } from '../src/market-auth.js';
import { MarketStore } from '../src/market-store.js';

const stores: MarketStore[] = [];
afterEach(() => stores.splice(0).forEach(store => store.close()));
const origin = 'http://localhost:3000';
const wallet = Wallet.generate();
const other = Wallet.generate();
function setup() {
  let time = 1_800_000_000_000;
  const store = new MarketStore(':memory:'); stores.push(store);
  const auth = new MarketAuth(store, origin, () => time);
  return { auth, store, advance: () => { time += 120_001; } };
}
function envelope(challenge: {id:string;message:string}, signer = wallet) {
  return {challengeId:challenge.id,publicKey:signer.publicKey,signature:sign(Buffer.from(challenge.message).toString('hex'),signer.privateKey)};
}
describe('wallet signed marketplace intents', () => {
  it('binds domain, network, account and exact action then consumes only once', () => {
    const {auth} = setup();
    const action = {type:'cancel',offerId:'offer-1'};
    const challenge = auth.challenge(wallet.address,action);
    expect(JSON.parse(challenge.message)).toMatchObject({domain:'Raise Marketplace Intent',version:1,origin,networkId:4001,account:wallet.address,action});
    expect(auth.consume(envelope(challenge))).toMatchObject({account:wallet.address,action});
    expect(() => auth.consume(envelope(challenge))).toThrow(/expired|used|challenge/i);
  });
  it('rejects another account and modified signed message without consuming the valid challenge', () => {
    const {auth} = setup(); const challenge=auth.challenge(wallet.address,{type:'cancel',offerId:'offer-1'});
    expect(() => auth.consume(envelope(challenge,other))).toThrow(/signature|account/i);
    expect(() => auth.consume(envelope({...challenge,message:challenge.message.replace('offer-1','offer-2')}))).toThrow(/signature/i);
    expect(auth.consume(envelope(challenge)).account).toBe(wallet.address);
  });
  it('rejects expired signatures and cross-origin envelopes', () => {
    const {auth,advance}=setup(); const challenge=auth.challenge(wallet.address,{type:'cancel',offerId:'offer-1'});
    advance(); expect(() => auth.consume(envelope(challenge))).toThrow(/expired/i);
    const another=setup(); const cross=another.auth.challenge(wallet.address,{type:'cancel',offerId:'offer-1'});
    expect(() => auth.consume(envelope(cross))).toThrow(/challenge/i);
  });
  it('rejects the same stored signature on another configured application origin', () => {
    const {auth,store}=setup();const challenge=auth.challenge(wallet.address,{type:'cancel',offerId:'offer-1'});
    const otherOrigin=new MarketAuth(store,'http://localhost:4000',()=>1_800_000_000_000);
    expect(() => otherOrigin.consume(envelope(challenge))).toThrow(/signature/i);
    expect(auth.consume(envelope(challenge)).account).toBe(wallet.address);
  });
  it('rejects unknown nested Batch fields before persisting an unsigned challenge', () => {
    const {auth}=setup();
    expect(() => auth.challenge(wallet.address,{type:'buyer-sign',offerId:'x',batch:{TransactionType:'Batch',seed:'not-a-secret',RawTransactions:[]}})).toThrow(/fields/i);
  });
  it('rejects malformed action payloads and seed-like unexpected fields before persisting', () => {
    const {auth}=setup();
    expect(() => auth.challenge(wallet.address,{type:'cancel',offerId:'x',seed:'not-a-secret'})).toThrow(/fields/i);
    expect(() => auth.challenge(wallet.address,{type:'admin'})).toThrow(/action/i);
  });
});
