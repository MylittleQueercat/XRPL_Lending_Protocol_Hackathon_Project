import { OfferService, type Offer, type OfferStore, type SettlementProof } from './offers.js';
import type { PositionInput, PositionSnapshot } from './ledger-reader.js';
import { MarketStore } from './market-store.js';
import { acceptBuyerSignature, acceptSellerSignature, assertPreparedBatch } from './market-signatures.js';
import type { MarketAction, MarketSnapshot, StoredAttempt } from './market-types.js';

export type MarketVerification = {status:'pending'|'failed';message:string} | {status:'settled';proof:SettlementProof};
export interface MarketGateway {
  checkMaster(account:string):Promise<void>;
  checkBuyerReceive(offer:Offer,buyer:string):Promise<void>;
  readPosition(input:PositionInput):Promise<PositionSnapshot>;
  prepareBatch(offer:Offer):Promise<Record<string,unknown>>;
  submit(blob:string):Promise<void>;
  verify(offer:Offer,attempt:StoredAttempt):Promise<MarketVerification>;
}
/** Authenticated API calls enter execute only after a one-use intent verification. */
export class MarketService {
  private readonly offers:OfferService;
  constructor(private readonly store:MarketStore,offerStore:OfferStore,private readonly gateway:MarketGateway,private readonly now:()=>number=Date.now) {
    this.offers=new OfferService(offerStore,{readPosition:input=>gateway.readPosition(input),now,verifySettlement:async offer=>{
      const attempt=store.getAttempt(offer.id);if(!attempt)return null;
      const result=await gateway.verify(offer,attempt);return result.status==='settled'?result.proof:null;
    }});
  }
  snapshot():MarketSnapshot {
    const offers=this.offers.list();
    const attempts=offers.flatMap(offer=>{
      const attempt=this.store.getAttempt(offer.id);
      if(!attempt)return [];
      const {revision:_revision,blob:_blob,...publicAttempt}=attempt;
      const needsSignatures=attempt.status==='awaiting-buyer' || attempt.status==='awaiting-seller';
      return [{...publicAttempt,batch:needsSignatures?publicAttempt.batch:null}];
    });
    return {offers,attempts};
  }
  private save(attempt:StoredAttempt,patch:Partial<StoredAttempt>):StoredAttempt {
    const next={...attempt,...patch,revision:attempt.revision+1};this.store.updateAttempt(next,attempt.revision);return next;
  }
  private offer(id:string):Offer {const offer=this.offers.get(id);if(!offer)throw new Error('Offer not found.');return offer;}
  private actor(offer:Offer,actor:string,role:'buyer'|'seller'|'either'):void {
    if((role==='seller' && actor!==offer.seller) || (role==='buyer' && actor!==offer.settlement?.buyer) || (role==='either' && actor!==offer.seller && actor!==offer.settlement?.buyer))throw new Error(`Only the offer ${role} may perform this action.`);
  }
  private async prepare(offer:Offer,buyer:string):Promise<void> {
    // A retry may finish unsigned preparation after a process stopped between the
    // offer reservation and attempt creation. Existing signed terms are never rebuilt.
    if(offer.state==='open')await this.gateway.checkBuyerReceive(offer,buyer);
    const reserved=offer.state==='open'?await this.offers.prepareSettlement(offer.id,buyer):offer;
    this.actor(reserved,buyer,'buyer');
    if(reserved.state!=='settling' || !reserved.settlement)throw new Error('Offer cannot prepare a settlement.');
    if(this.store.getAttempt(offer.id))return;
    const batch=await this.gateway.prepareBatch(reserved);assertPreparedBatch(batch,reserved);
    if(this.now()>=Date.parse(reserved.expiresAt))throw new Error('Offer expired during preparation; settlement remains reserved.');
    this.store.insertAttempt({offerId:offer.id,id:reserved.settlement.id,buyer,revision:0,status:'awaiting-buyer',batch,blob:null,hash:null,lastLedgerSequence:Number(batch.LastLedgerSequence),message:null});
  }
  private async reconcile(offer:Offer,attempt:StoredAttempt):Promise<void> {
    if(offer.state==='settled' && offer.settlement?.proof?.transactionHash===attempt.hash) {
      if(attempt.status!=='settled')this.save(attempt,{status:'settled',message:'Both exchange legs validated; recovered durable settlement proof.'});
      return;
    }
    if(!attempt.hash || attempt.status==='settled' || attempt.status==='failed')return;
    const result=await this.gateway.verify(offer,attempt);
    if(result.status==='settled') {
      // OfferService verifies exact proof fields too; the transport may be read twice.
      const settled=await this.offers.reconcileSettlement(offer.id,attempt.id);
      if(settled.state!=='settled')return;
      const current=this.store.getAttempt(offer.id)!;
      if(current.status!=='settled')this.save(current,{status:'settled',message:'Both exchange legs validated in the same Batch.'});
    } else {
      const current=this.store.getAttempt(offer.id)!;
      if(current.status==='settled' || current.status==='failed')return;
      this.save(current,{status:result.status,message:result.message});
    }
  }
  async execute(account:string,action:MarketAction):Promise<MarketSnapshot> {
    await this.gateway.checkMaster(account);
    if(action.type==='create') {
      if(action.input.seller!==account)throw new Error('Only the seller may publish this offer.');
      const draft=this.offers.createDraft(action.input);this.offers.publish(draft.id,account);return this.snapshot();
    }
    const offer=this.offer(action.offerId);
    if(action.type==='cancel')this.offers.cancel(offer.id,account);
    else if(action.type==='prepare')await this.prepare(offer,account);
    else {
      const attempt=this.store.getAttempt(offer.id);if(!attempt)throw new Error('Settlement has not been prepared.');
      if(action.type==='reconcile') {this.actor(offer,account,'either');await this.reconcile(offer,attempt);}
      else if(action.type==='buyer-sign') {
        this.actor(offer,account,'buyer');
        if(attempt.status!=='awaiting-buyer' || !attempt.batch)throw new Error('Settlement is not awaiting buyer approval.');
        if(this.now()>=Date.parse(offer.expiresAt))throw new Error('Offer expired; settlement remains reserved.');
        const batch=acceptBuyerSignature(attempt.batch,action.batch,account);
        this.save(attempt,{batch,status:'awaiting-seller'});
      } else if(action.type==='seller-submit') {
        this.actor(offer,account,'seller');
        if(attempt.hash)return this.snapshot(); // No automatic resubmit, even an identical blob.
        if(attempt.status!=='awaiting-seller' || !attempt.batch)throw new Error('Settlement is not awaiting seller approval.');
        if(this.now()>=Date.parse(offer.expiresAt))throw new Error('Offer expired; signed authorization is not revoked.');
        const signed=acceptSellerSignature(attempt.batch,action.txBlob,account);
        await this.gateway.checkBuyerReceive(offer,attempt.buyer);
        // Another request may have claimed submission while the ledger read awaited.
        const refreshed=this.store.getAttempt(offer.id)!;
        if(refreshed.hash)return this.snapshot();
        if(refreshed.revision!==attempt.revision)throw new Error('Settlement changed during receipt preflight.');
        if(this.now()>=Date.parse(offer.expiresAt))throw new Error('Offer expired during receipt preflight; signed authorization is not revoked.');
        // Exact blob and hash are durable before the single network call. A crash
        // here is unknown and must be recovered by read-only hash lookup.
        const claimed=this.save(attempt,{batch:signed.batch,blob:signed.blob,hash:signed.hash,status:'submitting',message:'Submission claimed; outcome not yet known.'});
        try {await this.gateway.submit(signed.blob);}catch{/* A timeout cannot prove rejection. */}
        const current=this.store.getAttempt(offer.id)!;
        if(current.revision===claimed.revision)this.save(current,{status:'pending',message:'Awaiting ledger confirmation; use read-only reconciliation.'});
      }
    }
    return this.snapshot();
  }
}
