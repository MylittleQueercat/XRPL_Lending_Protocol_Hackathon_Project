import { DatabaseSync } from 'node:sqlite';
import { offerIdentifier, validateOffer, validateOfferFilter, type Offer, type OfferFilter, type OfferState, type OfferStore } from './offers.js';

const transitions: Record<OfferState, OfferState[]> = {draft:['open','cancelled','expired'],open:['cancelled','expired','settling'],cancelled:[],expired:[],settling:['settled'],settled:[]};
const immutableKeys = ['networkId','vaultId','shareMptId','seller','sharesRaw','priceAsset','priceDrops','expiresAt','createdAt'] as const;

/** Durable storage for one host. WAL and revision CAS protect independent local
 * processes. Business operations must go through OfferService; no public API is exposed.
 */
export class SqliteOfferStore implements OfferStore {
  private readonly db:DatabaseSync;
  private closed=false;
  constructor(path:string) {
    if (typeof path!=='string' || !path || path.includes('\0')) throw new Error('Invalid SQLite database path.');
    this.db=new DatabaseSync(path);
    try {
      this.db.exec('PRAGMA busy_timeout = 5000');
      this.db.exec('BEGIN IMMEDIATE');
      const version=this.db.prepare('PRAGMA user_version').get()?.user_version;
      if (version!==0 && version!==1) throw new Error('Unsupported offers database schema version.');
      if (version===0) {
        this.db.exec(`CREATE TABLE offers (
          id TEXT PRIMARY KEY NOT NULL,
          revision INTEGER NOT NULL CHECK (revision >= 0),
          state TEXT NOT NULL,
          seller TEXT NOT NULL,
          vault_id TEXT NOT NULL,
          data TEXT NOT NULL
        ) STRICT;
        CREATE INDEX offers_discovery ON offers(state, seller, vault_id);
        PRAGMA user_version = 1;`);
      }
      this.db.exec('COMMIT');
      this.db.exec('PRAGMA journal_mode = WAL');
      this.db.exec('PRAGMA synchronous = FULL');
    } catch(error) {
      try{this.db.exec('ROLLBACK');}catch{/* No transaction if the failure happened after COMMIT. */}
      this.db.close();throw error;
    }
  }
  close():void {if(!this.closed){this.db.close();this.closed=true;}}
  private decode(row:Record<string,unknown>):Offer {
    if(typeof row.data!=='string')throw new Error('Corrupt offer row.');
    const offer=validateOffer(JSON.parse(row.data));
    if(row.id!==offer.id || row.revision!==offer.revision || row.state!==offer.state || row.seller!==offer.seller || row.vault_id!==offer.vaultId)throw new Error('Corrupt offer row metadata.');
    return offer;
  }
  get(id:string):Offer|null {
    const row=this.db.prepare('SELECT * FROM offers WHERE id = ?').get(offerIdentifier(id));
    return row?this.decode(row):null;
  }
  list(filter:OfferFilter={}):Offer[] {
    const f=validateOfferFilter(filter);
    return this.db.prepare('SELECT * FROM offers WHERE (? IS NULL OR state = ?) AND (? IS NULL OR seller = ?) AND (? IS NULL OR vault_id = ?) ORDER BY id')
      .all(f.state??null,f.state??null,f.seller??null,f.seller??null,f.vaultId??null,f.vaultId??null).map(row=>this.decode(row));
  }
  insert(value:Offer):void {
    const offer=validateOffer(value);
    if(offer.revision!==0 || offer.state!=='draft')throw new Error('New offers must start as draft at revision zero.');
    this.db.prepare('INSERT INTO offers (id, revision, state, seller, vault_id, data) VALUES (?, ?, ?, ?, ?, ?)')
      .run(offer.id,offer.revision,offer.state,offer.seller,offer.vaultId,JSON.stringify(offer));
  }
  updateCAS(value:Offer,expectedRevision:number):void {
    const offer=validateOffer(value);
    if(!Number.isSafeInteger(expectedRevision) || expectedRevision<0 || offer.revision!==expectedRevision+1)throw new Error('Invalid compare-and-swap revision.');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const previous=this.get(offer.id);
      if(!previous || previous.revision!==expectedRevision)throw new Error('Offer revision conflict: state changed in another operation.');
      if(!transitions[previous.state].includes(offer.state))throw new Error('Invalid offer state transition.');
      if(previous.settlement && JSON.stringify({...previous.settlement,proof:null})!==JSON.stringify({...offer.settlement,proof:null}))throw new Error('Settlement attempt is immutable.');
      if(immutableKeys.some(key=>JSON.stringify(previous[key])!==JSON.stringify(offer[key])))throw new Error('Offer terms are immutable.');
      const changed=this.db.prepare('UPDATE offers SET revision = ?, state = ?, data = ? WHERE id = ? AND revision = ?')
        .run(offer.revision,offer.state,JSON.stringify(offer),offer.id,expectedRevision);
      if(changed.changes!==1)throw new Error('Offer revision conflict.');
      this.db.exec('COMMIT');
    }catch(error){this.db.exec('ROLLBACK');throw error;}
  }
}
