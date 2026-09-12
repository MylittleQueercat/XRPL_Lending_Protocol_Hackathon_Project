import { randomUUID } from 'node:crypto';
import { isValidClassicAddress } from 'xrpl';
import type { PositionInput, PositionSnapshot, LedgerSnapshot } from './ledger-reader.js';

export type OfferState = 'draft' | 'open' | 'cancelled' | 'expired' | 'settling' | 'settled';
export interface CreateOfferInput {
  networkId: 4001;
  vaultId: string;
  shareMptId: string;
  seller: string;
  sharesRaw: string;
  priceAsset: { currency: 'XRP' };
  priceDrops: string;
  expiresAt: string;
}
export interface SettlementProof {
  attemptId: string;
  networkId: 4001;
  transactionHash: string;
  ledgerHash: string;
  ledgerIndex: number;
  shares: { from: string; to: string; shareMptId: string; sharesRaw: string };
  payment: { from: string; to: string; asset: { currency: 'XRP' }; drops: string };
}
export interface SettlementAttempt {
  id: string;
  buyer: string;
  preparedAt: string;
  ledger: LedgerSnapshot;
  proof: SettlementProof | null;
}
export interface Offer extends CreateOfferInput {
  id: string;
  revision: number;
  state: OfferState;
  createdAt: string;
  updatedAt: string;
  settlement: SettlementAttempt | null;
}
export interface OfferFilter { state?: OfferState; seller?: string; vaultId?: string }
export interface OfferStore {
  get(id: string): Offer | null;
  list(filter?: OfferFilter): Offer[];
  insert(offer: Offer): void;
  updateCAS(offer: Offer, expectedRevision: number): void;
}
export interface OfferServiceOptions {
  readPosition(input: PositionInput): Promise<PositionSnapshot>;
  now?: () => number;
  id?: () => string;
  /** Trusted integration boundary, never an HTTP/request-provided callback.
   * It must bind the attempt to the actual submitted transaction and verify validated
   * metadata for BOTH exchange legs. Outer Batch success is not sufficient.
   * null means unknown: the offer stays settling. No adapter means fail closed.
   */
  verifySettlement?: (offer: Readonly<Offer>, attempt: Readonly<SettlementAttempt>) => Promise<SettlementProof | null>;
}
const states: OfferState[] = ['draft','open','cancelled','expired','settling','settled'];
const inputKeys = ['networkId','vaultId','shareMptId','seller','sharesRaw','priceAsset','priceDrops','expiresAt'];
const offerKeys = [...inputKeys,'id','revision','state','createdAt','updatedAt','settlement'];
const MAX_SHARES = 9_223_372_036_854_775_807n;
const MAX_DROPS = 100_000_000_000_000_000n;

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid ${label}: expected an object.`);
  return value as Record<string,unknown>;
}
function keys(value: Record<string,unknown>, expected: string[], label: string): void {
  if (Object.keys(value).some(key => !expected.includes(key)) || expected.some(key => !Object.hasOwn(value,key))) throw new Error(`Invalid ${label} fields.`);
}
function hex(value: unknown, length: number, label: string): string {
  if (typeof value !== 'string' || value.length !== length || !/^[a-fA-F0-9]+$/.test(value)) throw new Error(`Invalid ${label}.`);
  return value.toUpperCase();
}
export function offerIdentifier(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(value)) throw new Error('Invalid offer or attempt ID.');
  return value;
}
function address(value: unknown, label: string): string {
  if (typeof value !== 'string' || !isValidClassicAddress(value)) throw new Error(`Invalid ${label} classic address.`);
  return value;
}
function whole(value: unknown, maximum: bigint, label: string, positive = true): string {
  if (typeof value !== 'string' || value.length > 19 || !/^(0|[1-9]\d*)$/.test(value) || BigInt(value)>maximum || (positive && BigInt(value)===0n)) throw new Error(`Invalid ${label}: expected ${positive?'positive':'nonnegative'} bounded integer string.`);
  return value;
}
function instant(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length !== 24 || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new Error(`Invalid ${label}: expected canonical UTC ISO timestamp.`);
  return value;
}
function xrp(value: unknown): {currency:'XRP'} {
  const asset=object(value,'price asset');keys(asset,['currency'],'price asset');
  if (asset.currency!=='XRP') throw new Error('Only the XRP price asset is supported.');
  return {currency:'XRP'};
}
function revision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value<0) throw new Error('Invalid offer revision.');
  return value;
}
function state(value: unknown): OfferState {
  if (typeof value !== 'string' || !states.includes(value as OfferState)) throw new Error('Invalid offer state.');
  return value as OfferState;
}
function parseInput(value: Record<string,unknown>): CreateOfferInput {
  if (value.networkId!==4001) throw new Error('Offers require network 4001.');
  return {networkId:4001,vaultId:hex(value.vaultId,64,'vault ID'),shareMptId:hex(value.shareMptId,48,'share issuance ID'),seller:address(value.seller,'seller'),sharesRaw:whole(value.sharesRaw,MAX_SHARES,'share amount'),priceAsset:xrp(value.priceAsset),priceDrops:whole(value.priceDrops,MAX_DROPS,'price drops'),expiresAt:instant(value.expiresAt,'expiry')};
}
function ledger(value: unknown): LedgerSnapshot {
  const entry=object(value,'ledger snapshot');keys(entry,['hash','index','ageSeconds','readAt'],'ledger snapshot');
  if (typeof entry.index!=='number' || !Number.isSafeInteger(entry.index) || entry.index<1 || entry.index>4_294_967_295) throw new Error('Invalid ledger index.');
  if (typeof entry.ageSeconds!=='number' || !Number.isFinite(entry.ageSeconds) || entry.ageSeconds<0 || entry.ageSeconds>30) throw new Error('Stale or invalid ledger age.');
  return {hash:hex(entry.hash,64,'ledger hash'),index:entry.index,ageSeconds:entry.ageSeconds,readAt:instant(entry.readAt,'ledger readAt')};
}
function parseProof(value: unknown, offer: CreateOfferInput, attempt: SettlementAttempt): SettlementProof {
  const p=object(value,'settlement proof');keys(p,['attemptId','networkId','transactionHash','ledgerHash','ledgerIndex','shares','payment'],'settlement proof');
  const shares=object(p.shares,'share leg');keys(shares,['from','to','shareMptId','sharesRaw'],'share leg');
  const payment=object(p.payment,'payment leg');keys(payment,['from','to','asset','drops'],'payment leg');
  xrp(payment.asset);
  if (p.attemptId!==attempt.id || p.networkId!==offer.networkId || shares.from!==offer.seller || shares.to!==attempt.buyer || shares.shareMptId!==offer.shareMptId || shares.sharesRaw!==offer.sharesRaw || payment.from!==attempt.buyer || payment.to!==offer.seller || payment.drops!==offer.priceDrops) throw new Error('Settlement proof does not match this attempt and both exact exchange legs.');
  if (typeof p.ledgerIndex!=='number' || !Number.isSafeInteger(p.ledgerIndex) || p.ledgerIndex<=attempt.ledger.index || p.ledgerIndex>4_294_967_295) throw new Error('Settlement proof has an invalid ledger index: it must follow the preflight ledger.');
  return {attemptId:attempt.id,networkId:4001,transactionHash:hex(p.transactionHash,64,'transaction hash'),ledgerHash:hex(p.ledgerHash,64,'ledger hash'),ledgerIndex:p.ledgerIndex,shares:{from:offer.seller,to:attempt.buyer,shareMptId:offer.shareMptId,sharesRaw:offer.sharesRaw},payment:{from:attempt.buyer,to:offer.seller,asset:{currency:'XRP'},drops:offer.priceDrops}};
}
/** Validates persisted data as well as new data. A corrupt row is never trusted. */
export function validateOffer(value: unknown): Offer {
  const row=object(value,'offer');keys(row,offerKeys,'offer');
  const input=parseInput(row);const status=state(row.state);
  const createdAt=instant(row.createdAt,'createdAt');const updatedAt=instant(row.updatedAt,'updatedAt');
  if (Date.parse(createdAt)>Date.parse(updatedAt) || Date.parse(createdAt)>=Date.parse(input.expiresAt)) throw new Error('Invalid offer timestamps.');
  let settlement:SettlementAttempt|null=null;
  if (row.settlement!==null) {
    const a=object(row.settlement,'settlement attempt');keys(a,['id','buyer','preparedAt','ledger','proof'],'settlement attempt');
    settlement={id:offerIdentifier(a.id),buyer:address(a.buyer,'buyer'),preparedAt:instant(a.preparedAt,'preparedAt'),ledger:ledger(a.ledger),proof:null};
    if (settlement.buyer===input.seller || Date.parse(settlement.preparedAt)<Date.parse(createdAt) || Date.parse(settlement.preparedAt)>Date.parse(updatedAt) || Date.parse(settlement.preparedAt)>=Date.parse(input.expiresAt)) throw new Error('Invalid settlement attempt identity or time.');
    if (a.proof!==null) settlement.proof=parseProof(a.proof,input,settlement);
  }
  if ((status==='settling' || status==='settled') !== (settlement!==null) || (status==='settled') !== (settlement?.proof!=null)) throw new Error('Offer state and settlement proof disagree.');
  return {...input,id:offerIdentifier(row.id),revision:revision(row.revision),state:status,createdAt,updatedAt,settlement};
}
export function validateOfferFilter(value: OfferFilter = {}): OfferFilter {
  const f=object(value,'offer filter');
  if (Object.keys(f).some(key=>!['state','seller','vaultId'].includes(key))) throw new Error('Invalid offer filter fields.');
  return {...(f.state===undefined?{}:{state:state(f.state)}),...(f.seller===undefined?{}:{seller:address(f.seller,'seller')}),...(f.vaultId===undefined?{}:{vaultId:hex(f.vaultId,64,'vault ID')})};
}

/** Local trusted-process orchestration; actor addresses are assertions, not authentication.
 * Database offers never prove balances. Preparation reserves only local intent, and
 * cancellation cannot revoke an authorization previously signed on the ledger.
 */
export class OfferService {
  private readonly now:()=>number;
  private readonly id:()=>string;
  constructor(private readonly store:OfferStore,private readonly options:OfferServiceOptions) {
    this.now=options.now??Date.now;this.id=options.id??randomUUID;
  }
  private time():number {
    const time=this.now();if (!Number.isSafeInteger(time) || time<0 || !Number.isFinite(new Date(time).getTime())) throw new Error('Invalid service clock.');return time;
  }
  private save(offer:Offer, changes:Partial<Pick<Offer,'state'|'settlement'>>):Offer {
    const now=this.time();if (now<Date.parse(offer.updatedAt)) throw new Error('Service clock moved backwards.');
    if ((changes.state==='open' || changes.state==='settling') && now>=Date.parse(offer.expiresAt)) throw new Error('Offer expired before the state transition.');
    const next=validateOffer({...offer,...changes,revision:offer.revision+1,updatedAt:new Date(now).toISOString()});
    this.store.updateCAS(next,offer.revision);return next;
  }
  createDraft(value:unknown):Offer {
    const input=object(value,'new offer');keys(input,inputKeys,'new offer');const data=parseInput(input);const now=this.time();
    if (Date.parse(data.expiresAt)<=now) throw new Error('Offer expiry must be in the future.');
    const offer=validateOffer({...data,id:this.id(),revision:0,state:'draft',createdAt:new Date(now).toISOString(),updatedAt:new Date(now).toISOString(),settlement:null});
    this.store.insert(offer);return offer;
  }
  get(id:string):Offer|null {
    const offer=this.store.get(offerIdentifier(id));
    if (offer && ['draft','open'].includes(offer.state) && Date.parse(offer.expiresAt)<=this.time()) return this.save(offer,{state:'expired'});
    return offer;
  }
  list(filter:OfferFilter={}):Offer[] {
    const f=validateOfferFilter(filter);const {state:desired,...lookup}=f;
    return this.store.list(lookup).map(offer=>this.get(offer.id)).filter((offer):offer is Offer=>offer!==null && (desired===undefined || offer.state===desired));
  }
  private require(id:string):Offer {const offer=this.get(id);if (!offer) throw new Error('Offer not found.');return offer;}
  private seller(offer:Offer,actor:string):void {if (address(actor,'seller')!==offer.seller) throw new Error('Only the offer seller may perform this operation.');}
  publish(id:string,seller:string):Offer {
    const offer=this.require(id);this.seller(offer,seller);
    if (offer.state!=='draft') throw new Error('Only a draft offer can be published.');return this.save(offer,{state:'open'});
  }
  cancel(id:string,seller:string):Offer {
    const offer=this.require(id);this.seller(offer,seller);
    if (offer.state==='cancelled') return offer;
    if (!['draft','open'].includes(offer.state)) throw new Error(`Cannot cancel offer in state ${offer.state}.`);
    return this.save(offer,{state:'cancelled'});
  }
  async prepareSettlement(id:string,buyer:string):Promise<Offer> {
    const offer=this.require(id);address(buyer,'buyer');
    if (buyer===offer.seller) throw new Error('Buyer must differ from seller.');
    if (offer.state!=='open') throw new Error('Only an open offer can prepare settlement.');
    const snapshot=await this.options.readPosition({vaultId:offer.vaultId,holder:offer.seller});
    const current=this.require(id);
    if (current.state!=='open' || current.revision!==offer.revision) throw new Error('Offer changed state or revision during ownership check.');
    const now=this.time();const source=ledger(snapshot.ledger);
    const readTime=Date.parse(source.readAt);
    if (readTime>now || source.ageSeconds+(now-readTime)/1000>30) throw new Error('Ownership snapshot is stale or from the future.');
    if (snapshot.networkId!==offer.networkId || snapshot.vaultId!==offer.vaultId || snapshot.shareMptId!==offer.shareMptId || snapshot.holderAddress!==offer.seller) throw new Error('Ownership snapshot belongs to another network, vault, issuance or seller.');
    const held=BigInt(whole(snapshot.heldSharesRaw,MAX_SHARES,'held shares',false));
    const supply=BigInt(whole(snapshot.totalSharesRaw,MAX_SHARES,'total shares',false));
    if (held>supply || held<BigInt(offer.sharesRaw)) throw new Error('Insufficient validated seller shares or invalid supply.');
    return this.save(current,{state:'settling',settlement:{id:offerIdentifier(this.id()),buyer,preparedAt:new Date(now).toISOString(),ledger:source,proof:null}});
  }
  async reconcileSettlement(id:string,attemptId:string):Promise<Offer> {
    offerIdentifier(attemptId);const offer=this.require(id);const attempt=offer.settlement;
    if (!attempt || attempt.id!==attemptId) throw new Error('Settlement attempt does not match.');
    if (offer.state==='settled') return offer;
    if (offer.state!=='settling') throw new Error('Offer is not settling.');
    if (!this.options.verifySettlement) throw new Error('No trusted settlement verifier is configured.');
    const result=await this.options.verifySettlement(structuredClone(offer),structuredClone(attempt));
    const current=this.require(id);
    if (current.settlement?.id!==attemptId) throw new Error('Settlement attempt changed during verification.');
    if (current.state==='settled') return current;
    if (current.state!=='settling' || current.revision!==offer.revision) throw new Error('Offer changed during verification.');
    if (result===null) return current;
    const proof=parseProof(result,current,current.settlement);
    return this.save(current,{state:'settled',settlement:{...current.settlement,proof}});
  }
}
