import { Client, hashes, type Request, type Transaction } from 'xrpl';
import { LedgerReader, type PositionInput, type PositionSnapshot } from './ledger-reader.js';
import type { Offer } from './offers.js';
import { buildSaleBatch } from './settlement.js';
import { asObject, canonical, type StoredAttempt } from './market-types.js';
import type { MarketGateway, MarketVerification } from './market-service.js';
import { TRACK1 } from './core.js';
import { assertPreparedBatch } from './market-signatures.js';

type LedgerRequest = (request:Record<string,unknown>)=>Promise<{result:unknown}>;
const pending = ():MarketVerification=>({status:'pending',message:'Exact transaction outcome is not yet fully verified. Reconcile by hash; do not pay again.'});
/** API v2 presents Payment.Amount as DeliverMax; the binary codec uses Amount.
 * Normalize this presentation alias only, never conflicting economic values. */
function canonicalLedgerTransaction(value:unknown):Transaction {
  const transaction={...asObject(value)};
  if(transaction.TransactionType==='Payment' && Object.hasOwn(transaction,'DeliverMax')) {
    if(Object.hasOwn(transaction,'Amount') && canonical(transaction.Amount)!==canonical(transaction.DeliverMax))throw new Error('Conflicting Payment amount fields.');
    transaction.Amount=transaction.DeliverMax;
    delete transaction.DeliverMax;
  }
  return transaction as unknown as Transaction;
}
/** Proof uses each transaction's metadata, never balance changes between arbitrary reads. */
export async function verifyBatchSettlement(offer:Offer,attempt:StoredAttempt,request:LedgerRequest):Promise<MarketVerification> {
  if(!attempt.hash || !attempt.batch || !offer.settlement)return pending();
  try {
    if(attempt.offerId!==offer.id || attempt.id!==offer.settlement.id || attempt.buyer!==offer.settlement.buyer)return pending();
    const {BatchSigners:_signers,SigningPubKey:_key,TxnSignature:_signature,...unsigned}=attempt.batch;
    assertPreparedBatch(unsigned,offer);
    const outer=asObject((await request({command:'tx',transaction:attempt.hash,binary:false})).result);
    if(outer.validated!==true || outer.hash!==attempt.hash || typeof outer.ledger_index!=='number' || outer.ledger_index<=offer.settlement.ledger.index || outer.ledger_index>4_294_967_295)return pending();
    const outerTx=asObject(outer.tx_json);
    if(hashes.hashSignedTx(outerTx as unknown as Transaction)!==attempt.hash || hashes.hashSignedTx(attempt.batch as unknown as Transaction)!==attempt.hash)return pending();
    const outerMeta=asObject(outer.meta);
    if(typeof outerMeta.TransactionResult!=='string')return pending();
    if(outerMeta.TransactionResult!=='tesSUCCESS')return {status:'failed',message:'The exact outer transaction validated with a failure. This attempt remains locked; no automatic retry.'};
    const raw=attempt.batch.RawTransactions as Array<{RawTransaction:Transaction}>;
    if(!Array.isArray(raw) || raw.length!==2)return pending();
    for(const wrapper of raw) {
      const hash=hashes.hashSignedTx(wrapper.RawTransaction);
      const inner=asObject((await request({command:'tx',transaction:hash,binary:false})).result);
      const meta=asObject(inner.meta);
      if(inner.validated!==true || inner.hash!==hash || inner.ledger_index!==outer.ledger_index || meta.ParentBatchID!==attempt.hash || meta.TransactionResult!=='tesSUCCESS' || hashes.hashSignedTx(canonicalLedgerTransaction(inner.tx_json))!==hash)return pending();
      const expected=(wrapper.RawTransaction as Transaction & {Amount:unknown}).Amount;
      if(canonical(meta.delivered_amount??meta.DeliveredAmount)!==canonical(expected))return pending();
    }
    const ledger=asObject((await request({command:'ledger',ledger_index:outer.ledger_index,transactions:false,expand:false})).result);
    if(ledger.validated!==true || Number(ledger.ledger_index)!==outer.ledger_index || typeof ledger.ledger_hash!=='string' || !/^[A-F0-9]{64}$/.test(ledger.ledger_hash))return pending();
    return {status:'settled',proof:{attemptId:attempt.id,networkId:4001,transactionHash:attempt.hash,ledgerIndex:outer.ledger_index,ledgerHash:ledger.ledger_hash,shares:{from:offer.seller,to:attempt.buyer,shareMptId:offer.shareMptId,sharesRaw:offer.sharesRaw},payment:{from:attempt.buyer,to:offer.seller,asset:{currency:'XRP'},drops:offer.priceDrops}}};
  }catch{return pending();}
}

// Ledger flags, verified against the protocol reference. xrpl.js 5.2.0-beta.1
// declares the issuance enum internally but does not export it from its public entry.
// https://xrpl.org/docs/references/protocol/ledger-data/ledger-entry-types/mptokenissuance
const shareIssuanceFlags={locked:0x00000001,requireAuth:0x00000004,canTransfer:0x00000020};
const shareHolderFlags={locked:0x00000001,authorized:0x00000002};

/** Receipt eligibility is read before reservation and checked again before broadcast.
 * LedgerReader pins the vault, issuance and holder to one fresh validated ledger. */
export async function checkBuyerReceipt(offer:Offer,buyer:string,readPosition:(input:PositionInput)=>Promise<PositionSnapshot>):Promise<void> {
  const snapshot=await readPosition({vaultId:offer.vaultId,holder:buyer});
  if(snapshot.networkId!==TRACK1.networkId || snapshot.networkId!==offer.networkId || snapshot.vaultId!==offer.vaultId || snapshot.shareMptId!==offer.shareMptId || snapshot.holderAddress!==buyer)throw new Error('Buyer receipt snapshot belongs to another network, vault, issuance or account.');
  const holder=snapshot.holder;
  if(!holder)throw new Error('Authorize this vault share issuance on the validated ledger before requesting the offer.');
  if(holder.LedgerEntryType!=='MPToken' || holder.Account!==buyer || holder.MPTokenIssuanceID!==offer.shareMptId)throw new Error('Buyer holding does not match this vault share issuance.');
  const issuanceFlags=snapshot.issuance.Flags,holderFlags=holder.Flags;
  if(typeof issuanceFlags!=='number' || !Number.isInteger(issuanceFlags) || issuanceFlags<0 || issuanceFlags>0xffffffff || typeof holderFlags!=='number' || !Number.isInteger(holderFlags) || holderFlags<0 || holderFlags>0xffffffff)throw new Error('Invalid share issuance or holder permission flags.');
  if((issuanceFlags & shareIssuanceFlags.canTransfer)===0)throw new Error('This vault share issuance does not permit transfers between holders.');
  // MPToken flags differ from issuance flags: Locked=1 and Authorized=2.
  // https://xrpl.org/docs/references/protocol/ledger-data/ledger-entry-types/mptoken
  if((issuanceFlags & shareIssuanceFlags.locked)!==0 || (holderFlags & shareHolderFlags.locked)!==0)throw new Error('Vault shares or the buyer holding are locked.');
  if((issuanceFlags & shareIssuanceFlags.requireAuth)!==0 && (holderFlags & shareHolderFlags.authorized)===0)throw new Error('Buyer requires explicit issuer authorization; domain-based eligibility is not verified by this marketplace.');
}

/** Fixed event network; each business action verifies a fresh validated server state. */
export class XrplMarketGateway implements MarketGateway {
  private readonly client=new Client(TRACK1.wsUrl,{connectionTimeout:10_000,timeout:12_000});
  private connecting:Promise<void>|null=null;
  private readonly reader=new LedgerReader({request:request=>this.request(request)});
  private async connect():Promise<void> {
    if(this.client.isConnected())return;
    if(!this.connecting)this.connecting=this.client.connect().finally(()=>{this.connecting=null;});
    await this.connecting;
  }
  private request:LedgerRequest=async request=>{await this.connect();return this.client.request(request as Request);};
  async checkMaster(account:string):Promise<void> {
    const response=asObject((await this.request({command:'server_info'})).result);
    const info=asObject(response.info),ledger=asObject(info.validated_ledger);
    if(info.network_id!==4001 || typeof ledger.age!=='number' || ledger.age<0 || ledger.age>30)throw new Error('Event network unavailable or validated ledger is stale.');
    const result=asObject((await this.request({command:'account_info',account,ledger_index:'validated'})).result);
    const data=asObject(result.account_data);
    if(result.validated!==true || data.Account!==account || typeof data.Flags!=='number' || (data.Flags & 0x00100000)!==0)throw new Error('This demo requires an enabled account master key on network 4001.');
  }
  readPosition(input:PositionInput){return this.reader.readPosition(input);}
  checkBuyerReceive(offer:Offer,buyer:string){return checkBuyerReceipt(offer,buyer,input=>this.readPosition(input));}
  async prepareBatch(offer:Offer):Promise<Record<string,unknown>> {
    if(!offer.settlement)throw new Error('Missing settlement reservation.');
    await this.checkMaster(offer.seller);await this.checkMaster(offer.settlement.buyer);
    const prepared=await this.client.autofill(buildSaleBatch(offer.seller,offer.settlement.buyer,offer.shareMptId,offer.priceDrops,offer.sharesRaw),1);
    // Give two independent signers a bounded ledger window. Signed terms are never renewed.
    prepared.LastLedgerSequence=offer.settlement.ledger.index+120;
    return prepared as unknown as Record<string,unknown>;
  }
  async submit(blob:string):Promise<void> {await this.connect();await this.client.submit(blob);}
  verify(offer:Offer,attempt:StoredAttempt){return verifyBatchSettlement(offer,attempt,this.request);}
}
