import { randomUUID } from 'node:crypto';
import { deriveAddress, isValidClassicAddress, verifyKeypairSignature } from 'xrpl';
import { offerIdentifier, validateOffer } from './offers.js';
import { asObject, exactKeys, type MarketAction, type MarketChallenge } from './market-types.js';
import { MarketStore } from './market-store.js';

function publicBatch(value:unknown):void {
  const batch=asObject(value);
  const outer=['TransactionType','Account','NetworkID','Flags','Sequence','Fee','LastLedgerSequence','SigningPubKey','RawTransactions','BatchSigners'];
  if(Object.keys(batch).some(key=>!outer.includes(key)))throw new Error('Unexpected Batch fields.');
  if(!Array.isArray(batch.RawTransactions) || batch.RawTransactions.length!==2 || !Array.isArray(batch.BatchSigners) || batch.BatchSigners.length!==1)throw new Error('Invalid Batch fields.');
  const fields=['TransactionType','Account','Destination','Amount','Flags','Sequence','Fee','SigningPubKey','NetworkID'];
  for(const raw of batch.RawTransactions){
    const wrapper=asObject(raw);exactKeys(wrapper,['RawTransaction']);const tx=asObject(wrapper.RawTransaction);
    if(Object.keys(tx).some(key=>!fields.includes(key)))throw new Error('Unexpected transaction fields.');
    if(typeof tx.Amount!=='string')exactKeys(asObject(tx.Amount),['mpt_issuance_id','value']);
  }
  const signer=asObject(batch.BatchSigners[0]);exactKeys(signer,['BatchSigner']);
  exactKeys(asObject(signer.BatchSigner),['Account','SigningPubKey','TxnSignature']);
}
function parseAction(value: unknown, now:number): MarketAction {
  const action = asObject(value);
  if (action.type === 'create') {
    exactKeys(action,['type','input']);
    const input = asObject(action.input);
    exactKeys(input,['networkId','vaultId','shareMptId','seller','sharesRaw','priceAsset','priceDrops','expiresAt']);
    exactKeys(asObject(input.priceAsset),['currency']);
    const timestamp=new Date(now).toISOString();
    validateOffer({...input,id:'challenge-validation',revision:0,state:'draft',createdAt:timestamp,updatedAt:timestamp,settlement:null});
  } else if (['cancel','prepare','reconcile','buyer-sign','seller-submit'].includes(String(action.type))) {
    exactKeys(action,['type','offerId',...(action.type === 'buyer-sign' ? ['batch'] : action.type === 'seller-submit' ? ['txBlob'] : [])]);
    offerIdentifier(action.offerId);
    if (action.type === 'buyer-sign') publicBatch(action.batch);
    if (action.type === 'seller-submit' && (typeof action.txBlob !== 'string' || action.txBlob.length > 32768 || !/^[0-9A-Fa-f]+$/.test(action.txBlob))) throw new Error('Invalid transaction blob.');
  } else throw new Error('Unsupported market action.');
  if (JSON.stringify(action).length > 40000) throw new Error('Action is too large.');
  return structuredClone(action) as unknown as MarketAction;
}

/** A domain-separated master-key intent is not an XRPL transaction signature. */
export class MarketAuth {
  constructor(private readonly store: MarketStore, private readonly origin: string, private readonly now: () => number = Date.now) {}
  challenge(account: unknown, value: unknown): MarketChallenge {
    if (typeof account !== 'string' || !isValidClassicAddress(account)) throw new Error('Invalid account.');
    const action = parseAction(value,this.now());
    const id = randomUUID(); const expiresAt = new Date(this.now() + 120_000).toISOString();
    const message = JSON.stringify({domain:'Raise Marketplace Intent',version:1,origin:this.origin,networkId:4001,account,nonce:id,expiresAt,action});
    const challenge = {id,message,expiresAt};
    this.store.addChallenge(challenge,this.now()); return challenge;
  }
  consume(value: unknown): {account:string;action:MarketAction} {
    const envelope = asObject(value); exactKeys(envelope,['challengeId','publicKey','signature']);
    const id = offerIdentifier(envelope.challengeId);
    if (typeof envelope.publicKey !== 'string' || !/^[0-9A-Fa-f]{66}$/.test(envelope.publicKey) || typeof envelope.signature !== 'string' || !/^[0-9A-Fa-f]{128,144}$/.test(envelope.signature)) throw new Error('Invalid signature format.');
    const message = this.store.getChallenge(id,this.now());
    const intent = JSON.parse(message) as {origin:string;account:string;action:MarketAction};
    if (intent.origin !== this.origin || deriveAddress(envelope.publicKey) !== intent.account || !verifyKeypairSignature(Buffer.from(message).toString('hex'),envelope.signature,envelope.publicKey)) throw new Error('Invalid account signature.');
    this.store.consumeChallenge(id,this.now());
    return {account:intent.account,action:intent.action};
  }
}
