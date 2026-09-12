import { DatabaseSync } from 'node:sqlite';
import type { MarketChallenge, StoredAttempt } from './market-types.js';

/** One local durable SQLite file; no secrets or private keys are stored. */
export class MarketStore {
  private readonly db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;
      CREATE TABLE IF NOT EXISTS market_challenges (id TEXT PRIMARY KEY, message TEXT NOT NULL, expires INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0) STRICT;
      CREATE TABLE IF NOT EXISTS market_attempts (offer_id TEXT PRIMARY KEY, revision INTEGER NOT NULL, data TEXT NOT NULL) STRICT;`);
  }
  close(): void { this.db.close(); }
  addChallenge(value: MarketChallenge, now: number): void {
    this.db.prepare('DELETE FROM market_challenges WHERE expires < ?').run(now - 120_000);
    const count = Number(this.db.prepare('SELECT count(*) AS total FROM market_challenges').get()?.total);
    if (count >= 1000) throw new Error('Too many pending requests; try later.');
    this.db.prepare('INSERT INTO market_challenges (id,message,expires) VALUES (?,?,?)').run(value.id,value.message,Date.parse(value.expiresAt));
  }
  getChallenge(id: string, now: number): string {
    const row = this.db.prepare('SELECT message,expires,used FROM market_challenges WHERE id = ?').get(id);
    if (!row || row.used !== 0 || typeof row.expires !== 'number' || row.expires <= now || typeof row.message !== 'string') throw new Error('Challenge is expired, used or unknown.');
    return row.message;
  }
  consumeChallenge(id: string, now: number): void {
    const result = this.db.prepare('UPDATE market_challenges SET used = 1 WHERE id = ? AND used = 0 AND expires > ?').run(id,now);
    if (result.changes !== 1) throw new Error('Challenge is expired, used or unknown.');
  }
  getAttempt(offerId: string): StoredAttempt | null {
    const row = this.db.prepare('SELECT data FROM market_attempts WHERE offer_id = ?').get(offerId);
    return row ? JSON.parse(String(row.data)) as StoredAttempt : null;
  }
  insertAttempt(attempt: StoredAttempt): void {
    this.db.prepare('INSERT INTO market_attempts (offer_id,revision,data) VALUES (?,?,?)').run(attempt.offerId,attempt.revision,JSON.stringify(attempt));
  }
  updateAttempt(attempt: StoredAttempt, expected: number): void {
    if (attempt.revision !== expected + 1) throw new Error('Invalid attempt revision.');
    const changed = this.db.prepare('UPDATE market_attempts SET revision = ?, data = ? WHERE offer_id = ? AND revision = ?').run(attempt.revision,JSON.stringify(attempt),attempt.offerId,expected);
    if (changed.changes !== 1) throw new Error('Settlement changed in another operation.');
  }
}
