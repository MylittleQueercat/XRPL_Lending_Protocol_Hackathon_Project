import { DatabaseSync } from 'node:sqlite';
import { canonical } from './market-types.js';
import { offerIdentifier } from './offers.js';
import { validatePartialOrder, type PartialOrder } from './partial-fills.js';

function equal(left:unknown,right:unknown):boolean{return canonical(left)===canonical(right);}
/** Standalone exploration store, not the active marketplace database/API.
 * All writes are trusted server operations. Proofs originate from the configured
 * ledger verifier; this class validates consistency and atomicity, not signatures.
 */
export class SqlitePartialStore {
  private readonly db:DatabaseSync;
  private closed=false;
  constructor(path:string){
    this.db=new DatabaseSync(path);
    try{
      this.db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
        CREATE TABLE IF NOT EXISTS partial_schema (id INTEGER PRIMARY KEY CHECK(id=1), version INTEGER NOT NULL) STRICT;
        INSERT OR IGNORE INTO partial_schema (id,version) VALUES (1,1);`);
      if(this.db.prepare('SELECT version FROM partial_schema WHERE id=1').get()?.version!==1)throw new Error('Unsupported partial-order schema version.');
      this.db.exec(`CREATE TABLE IF NOT EXISTS partial_orders (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, data TEXT NOT NULL) STRICT;
        CREATE TABLE IF NOT EXISTS partial_claims (attempt_id TEXT PRIMARY KEY, order_id TEXT NOT NULL, transaction_hash TEXT UNIQUE) STRICT;`);
    }catch(error){this.db.close();throw error;}
  }
  close():void{if(!this.closed){this.db.close();this.closed=true;}}
  get(id:string):PartialOrder|null{
    const row=this.db.prepare('SELECT id,revision,data FROM partial_orders WHERE id=?').get(offerIdentifier(id));
    if(!row)return null;
    const state=validatePartialOrder(JSON.parse(String(row.data)));
    if(state.id!==row.id || state.revision!==row.revision)throw new Error('Corrupt partial-order row metadata.');
    return state;
  }
  insert(value:PartialOrder):void{
    const state=validatePartialOrder(value);
    if(state.revision!==0 || state.status!=='open' || state.pending!==null || state.fills.length!==0)throw new Error('New partial orders must start open at revision zero.');
    this.db.prepare('INSERT INTO partial_orders(id,revision,data) VALUES (?,?,?)').run(state.id,state.revision,JSON.stringify(state));
  }
  updateCAS(value:PartialOrder,expectedRevision:number):void{
    const next=validatePartialOrder(value);
    if(!Number.isSafeInteger(expectedRevision) || expectedRevision<0 || next.revision!==expectedRevision+1)throw new Error('Invalid partial-order revision.');
    this.db.exec('BEGIN IMMEDIATE');
    try{
      const previous=this.get(next.id);
      if(!previous || previous.revision!==expectedRevision)throw new Error('Partial-order revision conflict.');
      if(!equal(previous.terms,next.terms) || previous.createdAt!==next.createdAt)throw new Error('Partial-order terms are immutable.');
      const sameAmounts=previous.filledSharesRaw===next.filledSharesRaw && previous.receivedDrops===next.receivedDrops;
      const sameHistory=equal(previous.fills,next.fills);
      const lifecycle=previous.status==='open' && ['cancelled','expired'].includes(next.status) && sameAmounts && sameHistory && equal(previous.pending,next.pending);
      const reserving=previous.status==='open' && next.status==='open' && !previous.pending && next.pending && next.pending.transactionHash===null && sameAmounts && sameHistory;
      const binding=previous.status===next.status && previous.pending && next.pending && previous.pending.transactionHash===null && next.pending.transactionHash!==null && equal({...previous.pending,transactionHash:null},{...next.pending,transactionHash:null}) && sameAmounts && sameHistory;
      const last=next.fills.at(-1);
      const completing=previous.pending && previous.pending.transactionHash && next.pending===null && last && next.fills.length===previous.fills.length+1 && equal(previous.fills,next.fills.slice(0,-1)) && equal(previous.pending,{attemptId:last.attemptId,buyer:last.buyer,sharesRaw:last.sharesRaw,priceDrops:last.priceDrops,preflightLedgerIndex:last.preflightLedgerIndex,transactionHash:last.transactionHash}) && (next.status===previous.status || next.status==='filled');
      if(!lifecycle && !reserving && !binding && !completing)throw new Error('Invalid partial-order state transition.');
      if(reserving){this.db.prepare('INSERT INTO partial_claims(attempt_id,order_id,transaction_hash) VALUES (?,?,NULL)').run(next.pending!.attemptId,next.id);}
      if(binding){
        const claimed=this.db.prepare('UPDATE partial_claims SET transaction_hash=? WHERE attempt_id=? AND order_id=? AND transaction_hash IS NULL').run(next.pending!.transactionHash,next.pending!.attemptId,next.id);
        if(claimed.changes!==1)throw new Error('Partial transaction hash claim conflict.');
      }
      const changed=this.db.prepare('UPDATE partial_orders SET revision=?,data=? WHERE id=? AND revision=?').run(next.revision,JSON.stringify(next),next.id,expectedRevision);
      if(changed.changes!==1)throw new Error('Partial-order revision conflict.');
      this.db.exec('COMMIT');
    }catch(error){this.db.exec('ROLLBACK');throw error;}
  }
}
