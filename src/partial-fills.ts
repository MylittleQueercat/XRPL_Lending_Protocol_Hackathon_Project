import { isValidClassicAddress } from 'xrpl';
import type { LedgerSnapshot } from './ledger-reader.js';
import { asObject, canonical, exactKeys } from './market-types.js';
import { offerIdentifier, validateOffer, type CreateOfferInput, type Offer, type SettlementProof } from './offers.js';

/** Standalone domain prototype, deliberately not wired into marketplace execution.
 * An integration must atomically persist revisions/reservations before collecting
 * signatures and preserve the existing single-broadcast, exact-hash coordinator.
 * The verifier below is a trusted server adapter, never an HTTP-supplied proof.
 */
export interface PartialReservation {
  attemptId:string;
  buyer:string;
  sharesRaw:string;
  priceDrops:string;
  preflightLedgerIndex:number;
  transactionHash:string|null;
}
export interface PartialFill extends Omit<PartialReservation,'transactionHash'> {
  transactionHash:string;
  proof:SettlementProof;
}
export interface PartialOrder {
  id:string;
  terms:CreateOfferInput;
  createdAt:string;
  revision:number;
  status:'open'|'cancelled'|'expired'|'filled';
  filledSharesRaw:string;
  receivedDrops:string;
  pending:PartialReservation|null;
  fills:PartialFill[];
}
export interface PartialQuote {
  sharesRaw:string;
  priceDrops:string;
  remainingSharesRaw:string;
  remainingPriceDrops:string;
}
export interface PartialVerificationContext {
  orderId:string;
  attemptId:string;
  transactionHash:string;
  networkId:4001;
  vaultId:string;
  shareMptId:string;
  seller:string;
  buyer:string;
  sharesRaw:string;
  priceDrops:string;
  preflightLedgerIndex:number;
}
export interface TrustedPartialSettlementVerifier {
  /** Must verify both exact transaction legs in validated metadata, tied to this
   * hash and one Batch ledger; never infer execution from balance snapshots. */
  verify(context:Readonly<PartialVerificationContext>):Promise<SettlementProof|null>;
}
function whole(value:unknown):bigint {
  if(typeof value!=='string' || !/^(0|[1-9]\d{0,18})$/.test(value))throw new Error('Expected an exact unsigned whole amount.');
  return BigInt(value);
}
function hash(value:string):string {
  if(!/^[A-Fa-f0-9]{64}$/.test(value))throw new Error('Invalid transaction or ledger hash.');
  return value.toUpperCase();
}
function uint32(value:number):boolean {return Number.isSafeInteger(value) && value>0 && value<=4_294_967_295;}
function next(state:PartialOrder,patch:Partial<PartialOrder>):PartialOrder {
  return structuredClone({...state,...patch,revision:state.revision+1});
}
function assertAccounting(state:PartialOrder):void {
  const total=whole(state.terms.sharesRaw),price=whole(state.terms.priceDrops),filled=whole(state.filledSharesRaw),received=whole(state.receivedDrops);
  if(total===0n || price===0n || filled>total || received!==price*filled/total)throw new Error('Partial-order accounting is inconsistent.');
  if(!Number.isSafeInteger(state.revision) || state.revision<0)throw new Error('Invalid partial-order revision.');
}
export function createPartialOrder(id:string,input:CreateOfferInput,now:number):PartialOrder {
  if(!Number.isSafeInteger(now) || now<0)throw new Error('Invalid clock.');
  const timestamp=new Date(now).toISOString();
  const validated=validateOffer({...input,id:offerIdentifier(id),revision:0,state:'draft',createdAt:timestamp,updatedAt:timestamp,settlement:null});
  const {networkId,vaultId,shareMptId,seller,sharesRaw,priceAsset,priceDrops,expiresAt}=validated;
  return {id:validated.id,terms:{networkId,vaultId,shareMptId,seller,sharesRaw,priceAsset,priceDrops,expiresAt},createdAt:timestamp,revision:0,status:'open',filledSharesRaw:'0',receivedDrops:'0',pending:null,fills:[]};
}
/** Cumulative floor allocation keeps the sum of all fills equal to the full ask.
 * A sub-drop allocation is rejected; it never becomes a free XRP payment leg.
 * Successive partial quotes can differ by one drop due to previous allocations. */
export function quotePartialFill(state:PartialOrder,quantity:string):PartialQuote {
  assertAccounting(state);
  const total=whole(state.terms.sharesRaw),price=whole(state.terms.priceDrops),filled=whole(state.filledSharesRaw),q=whole(quantity);
  if(q===0n || q>total-filled)throw new Error('Quantity exceeds remaining shares or is zero; overfill refused.');
  const nextPaid=price*(filled+q)/total,allocation=nextPaid-whole(state.receivedDrops);
  if(allocation===0n)throw new Error('A partial fill must allocate at least one drop; increase the quantity.');
  return {sharesRaw:q.toString(),priceDrops:allocation.toString(),remainingSharesRaw:(total-filled-q).toString(),remainingPriceDrops:(price-nextPaid).toString()};
}
export function reservePartialFill(state:PartialOrder,input:{attemptId:string;buyer:string;sharesRaw:string;preflightLedgerIndex:number},now:number):PartialOrder {
  assertAccounting(state);
  if(state.pending)throw new Error('One partial reservation is already pending.');
  if(state.status!=='open')throw new Error(`Partial order is not open: ${state.status}.`);
  if(!Number.isSafeInteger(now) || now<Date.parse(state.createdAt))throw new Error('Invalid reservation clock.');
  if(now>=Date.parse(state.terms.expiresAt))throw new Error('Partial order expired before reservation.');
  const attemptId=offerIdentifier(input.attemptId);
  if(state.fills.some(fill=>fill.attemptId===attemptId))throw new Error('Attempt ID was already used.');
  if(!isValidClassicAddress(input.buyer) || input.buyer===state.terms.seller)throw new Error('Buyer must be a valid account different from the seller.');
  if(!uint32(input.preflightLedgerIndex))throw new Error('Invalid preflight ledger index.');
  const quote=quotePartialFill(state,input.sharesRaw);
  return next(state,{pending:{attemptId,buyer:input.buyer,sharesRaw:quote.sharesRaw,priceDrops:quote.priceDrops,preflightLedgerIndex:input.preflightLedgerIndex,transactionHash:null}});
}
export function bindPartialTransaction(state:PartialOrder,attemptId:string,transactionHash:string):PartialOrder {
  const pending=state.pending;const normalized=hash(transactionHash);
  if(!pending || pending.attemptId!==attemptId)throw new Error('Pending attempt does not match.');
  if(pending.transactionHash===normalized)return structuredClone(state);
  if(pending.transactionHash)throw new Error('The transaction hash is immutable.');
  if(state.fills.some(fill=>fill.transactionHash===normalized))throw new Error('Transaction hash was already used.');
  return next(state,{pending:{...pending,transactionHash:normalized}});
}
function assertProof(context:PartialVerificationContext,proof:SettlementProof):void {
  if(proof.attemptId!==context.attemptId || proof.networkId!==4001 || proof.transactionHash!==context.transactionHash || !uint32(proof.ledgerIndex) || proof.ledgerIndex<=context.preflightLedgerIndex || !/^[A-F0-9]{64}$/.test(proof.ledgerHash) || proof.shares?.from!==context.seller || proof.shares?.to!==context.buyer || proof.shares?.shareMptId!==context.shareMptId || proof.shares?.sharesRaw!==context.sharesRaw || proof.payment?.from!==context.buyer || proof.payment?.to!==context.seller || proof.payment?.asset?.currency!=='XRP' || proof.payment?.drops!==context.priceDrops)throw new Error('Verified partial settlement proof does not match the exact reservation context.');
}
/** Returns a candidate next revision. A persistence adapter MUST use revision CAS;
 * this pure model does not itself serialize concurrent processes or send payments. */
export async function reconcilePartialFill(state:PartialOrder,identity:{attemptId:string;transactionHash:string},verifier:TrustedPartialSettlementVerifier):Promise<PartialOrder> {
  state=structuredClone(state);
  assertAccounting(state);const normalized=hash(identity.transactionHash);
  const completed=state.fills.find(fill=>fill.attemptId===identity.attemptId);
  if(completed){if(completed.transactionHash!==normalized)throw new Error('Completed attempt hash mismatch; replay refused.');return structuredClone(state);}
  const pending=state.pending;
  if(!pending || pending.attemptId!==identity.attemptId || pending.transactionHash!==normalized)throw new Error('Pending attempt or bound transaction hash does not match.');
  const context:PartialVerificationContext={orderId:state.id,attemptId:pending.attemptId,transactionHash:normalized,networkId:4001,vaultId:state.terms.vaultId,shareMptId:state.terms.shareMptId,seller:state.terms.seller,buyer:pending.buyer,sharesRaw:pending.sharesRaw,priceDrops:pending.priceDrops,preflightLedgerIndex:pending.preflightLedgerIndex};
  const verified=await verifier.verify(Object.freeze({...context}));
  if(verified===null)return structuredClone(state);
  assertProof(context,verified);
  const quote=quotePartialFill(state,pending.sharesRaw);
  if(quote.priceDrops!==pending.priceDrops)throw new Error('Reservation price changed before proof reconciliation.');
  const filled=whole(state.filledSharesRaw)+whole(pending.sharesRaw),received=whole(state.receivedDrops)+whole(pending.priceDrops);
  return next(state,{filledSharesRaw:filled.toString(),receivedDrops:received.toString(),pending:null,status:filled===whole(state.terms.sharesRaw)?'filled':state.status,fills:[...state.fills,{...pending,transactionHash:normalized,proof:structuredClone(verified)}]});
}
/** Cancels only future fills. It cannot revoke a pending signed authorization. */
export function cancelPartialOrder(state:PartialOrder,seller:string):PartialOrder {
  if(seller!==state.terms.seller)throw new Error('Only the seller may cancel the remainder.');
  if(state.status!=='open')return structuredClone(state);
  return next(state,{status:'cancelled'});
}
/** Expiry stops new fills; an already authorized fill can still validate later. */
export function expirePartialOrder(state:PartialOrder,now:number):PartialOrder {
  if(!Number.isSafeInteger(now) || now<Date.parse(state.createdAt))throw new Error('Invalid expiry clock.');
  return state.status==='open' && now>=Date.parse(state.terms.expiresAt)?next(state,{status:'expired'}):structuredClone(state);
}


/** Strict persistence validation, not a replacement for ledger verification. */
export function validatePartialOrder(value:unknown):PartialOrder {
  const raw=asObject(value);
  exactKeys(raw,['id','terms','createdAt','revision','status','filledSharesRaw','receivedDrops','pending','fills']);
  const terms=asObject(raw.terms);
  exactKeys(terms,['networkId','vaultId','shareMptId','seller','sharesRaw','priceAsset','priceDrops','expiresAt']);
  if(typeof raw.createdAt!=='string' || !['open','cancelled','expired','filled'].includes(String(raw.status)) || !Array.isArray(raw.fills))throw new Error('Invalid partial-order metadata.');
  const normalized=validateOffer({...terms,id:raw.id,revision:0,state:'draft',createdAt:raw.createdAt,updatedAt:raw.createdAt,settlement:null});
  const {networkId,vaultId,shareMptId,seller,sharesRaw,priceAsset,priceDrops,expiresAt}=normalized;
  if(canonical(terms)!==canonical({networkId,vaultId,shareMptId,seller,sharesRaw,priceAsset,priceDrops,expiresAt}))throw new Error('Partial-order terms must be canonical.');
  const state=structuredClone(raw) as unknown as PartialOrder;assertAccounting(state);
  const ids=new Set<string>(),hashes=new Set<string>();let filled=0n,received=0n;
  function reservation(value:unknown,completed:boolean):PartialReservation {
    const row=asObject(value);exactKeys(row,['attemptId','buyer','sharesRaw','priceDrops','preflightLedgerIndex','transactionHash',...(completed?['proof']:[])]);
    offerIdentifier(row.attemptId);
    if(typeof row.buyer!=='string' || !isValidClassicAddress(row.buyer) || row.buyer===state.terms.seller || !uint32(row.preflightLedgerIndex as number) || whole(row.sharesRaw)===0n || whole(row.priceDrops)===0n)throw new Error('Invalid partial reservation.');
    if(row.transactionHash!==null && (typeof row.transactionHash!=='string' || hash(row.transactionHash)!==row.transactionHash))throw new Error('Invalid canonical transaction hash.');
    if(ids.has(String(row.attemptId)))throw new Error('Partial attempt ID was already used.');
    ids.add(String(row.attemptId));
    if(typeof row.transactionHash==='string'){if(hashes.has(row.transactionHash))throw new Error('Partial transaction hash was already used.');hashes.add(row.transactionHash);}
    return row as unknown as PartialReservation;
  }
  for(const value of state.fills){
    const fill=reservation(value,true);if(!fill.transactionHash)throw new Error('Completed fill requires an exact transaction hash.');
    const q=whole(fill.sharesRaw);filled+=q;
    const allocated=whole(state.terms.priceDrops)*filled/whole(state.terms.sharesRaw)-received;
    if(allocated!==whole(fill.priceDrops) || filled>whole(state.terms.sharesRaw))throw new Error('Invalid partial-fill accounting history.');
    received+=allocated;
    const proof=asObject(value.proof);exactKeys(proof,['attemptId','networkId','transactionHash','ledgerHash','ledgerIndex','shares','payment']);
    exactKeys(asObject(proof.shares),['from','to','shareMptId','sharesRaw']);exactKeys(asObject(proof.payment),['from','to','asset','drops']);exactKeys(asObject(asObject(proof.payment).asset),['currency']);
    assertProof({orderId:state.id,attemptId:fill.attemptId,transactionHash:fill.transactionHash,networkId:4001,vaultId:state.terms.vaultId,shareMptId:state.terms.shareMptId,seller:state.terms.seller,buyer:fill.buyer,sharesRaw:fill.sharesRaw,priceDrops:fill.priceDrops,preflightLedgerIndex:fill.preflightLedgerIndex},value.proof);
  }
  if(filled!==whole(state.filledSharesRaw) || received!==whole(state.receivedDrops))throw new Error('Partial-fill history and accounting disagree.');
  if((state.status==='filled')!==(filled===whole(state.terms.sharesRaw)))throw new Error('Partial-order status disagrees with remaining shares.');
  if(state.pending!==null){
    if(state.status==='filled')throw new Error('A filled order cannot reserve another fill.');
    const pending=reservation(state.pending,false);const quote=quotePartialFill(state,pending.sharesRaw);
    if(quote.priceDrops!==pending.priceDrops)throw new Error('Partial reservation accounting disagrees with quote.');
  }
  return state;
}

/** Build exact immutable child terms for the existing Batch builder and verifier.
 * The adapter must preserve this validated preflight snapshot with its attempt,
 * then persist the prepared transaction and bound hash before submission. */
export function buildPartialChildOffer(value:PartialOrder,ledger:LedgerSnapshot):Offer {
  const state=validatePartialOrder(value),pending=state.pending;
  if(!pending || ledger.index!==pending.preflightLedgerIndex)throw new Error('Child offer requires the reserved preflight ledger.');
  return validateOffer({...state.terms,id:state.id,sharesRaw:pending.sharesRaw,priceDrops:pending.priceDrops,revision:state.revision,state:'settling',createdAt:state.createdAt,updatedAt:ledger.readAt,settlement:{id:pending.attemptId,buyer:pending.buyer,preparedAt:ledger.readAt,ledger:structuredClone(ledger),proof:null}});
}
