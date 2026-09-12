import { isValidClassicAddress } from 'xrpl';
import { record, TRACK1 } from './core.js';

/** This boundary deliberately exposes only public, read-only RPC methods. */
export interface ReadRequest {
  command: 'server_info' | 'ledger_entry' | 'account_objects' | 'tx';
  [key: string]: unknown;
}
export interface ReadTransport {
  request(request: ReadRequest): Promise<{ result: unknown }>;
  reconnect?(): Promise<void>;
}
export interface PositionInput {
  vaultId: string;
  holder: string;
  loanBrokerId?: string;
  loanId?: string;
}
export interface LedgerSnapshot {
  hash: string;
  index: number;
  ageSeconds: number;
  readAt: string;
}
export interface PositionSnapshot {
  networkId: number;
  ledger: LedgerSnapshot;
  vaultId: string;
  holderAddress: string;
  shareMptId: string;
  assetsTotalDrops: string;
  assetsAvailableDrops: string;
  lossUnrealizedDrops: string;
  totalSharesRaw: string;
  heldSharesRaw: string;
  shareScale: number;
  vault: Record<string, unknown>;
  issuance: Record<string, unknown>;
  holder: Record<string, unknown> | null;
  broker: Record<string, unknown> | null;
  loan: Record<string, unknown> | null;
}
export type TransactionStatus = 'submitted' | 'pending' | 'validated-success' | 'validated-failure' | 'expired-not-found';
export interface TrackedTransaction {
  hash: string;
  status: TransactionStatus;
  /** beginTracking records a caller assertion, never proof of network submission. */
  submissionSource: 'caller-reported';
  lastLedgerSequence?: number;
  ledgerIndex?: number;
  resultCode?: string;
  transactionType?: string;
  economicSuccess: 'unverified';
  note?: string;
}
interface ReaderOptions {
  maxAgeSeconds?: number;
  maxAttempts?: number;
  maxPages?: number;
  now?: () => number;
}
interface Anchor { hash: string; index: number; ageSeconds: number; capturedAt: number }
const HEX_256 = /^[A-Fa-f0-9]{64}$/;
const MAX_UINT63 = 9_223_372_036_854_775_807n;

function identifier(value: string, label: string): string {
  if (!HEX_256.test(value)) throw new Error(`Invalid ${label}: expected a 256-bit hexadecimal ID.`);
  return value.toUpperCase();
}
function rpcCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const value = error as Record<string, unknown>;
  if (typeof value.error === 'string') return value.error;
  if (value.data && typeof value.data === 'object') return rpcCode(value.data);
  return undefined;
}
function transient(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as Record<string, unknown>;
  return ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN'].includes(String(value.code))
    || ['ConnectionError', 'NotConnectedError', 'DisconnectedError', 'TimeoutError'].includes(String(value.name));
}
function decimal(value: unknown, label: string): string {
  const amount = value ?? '0';
  if (typeof amount !== 'string' || amount.length > 256 || !/^(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/.test(amount)) {
    throw new Error(`Invalid ${label}: expected a nonnegative decimal or scientific string in raw drops.`);
  }
  const exponent = Number(amount.split(/[eE]/)[1] ?? '0');
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 32768) throw new Error(`Invalid ${label}: NUMBER exponent is outside the supported protocol range.`);
  return amount;
}
function shares(value: unknown, label: string): string {
  const amount = decimal(value, label);
  if (!/^\d+$/.test(amount) || BigInt(amount) > MAX_UINT63) throw new Error(`Invalid ${label}: expected raw uint63 shares.`);
  return amount;
}

/** A session serializes reads so delayed calls cannot overwrite newer snapshots. */
export class LedgerReader {
  private readonly maxAge: number;
  private readonly attempts: number;
  private readonly maxPages: number;
  private readonly now: () => number;
  private previousAnchor: Anchor | null = null;
  private cached: PositionSnapshot | null = null;
  private tail: Promise<unknown> = Promise.resolve();
  private readonly transactions = new Map<string, TrackedTransaction>();

  constructor(private readonly transport: ReadTransport, options: ReaderOptions = {}) {
    this.maxAge = options.maxAgeSeconds ?? 30;
    this.attempts = options.maxAttempts ?? 2;
    this.maxPages = options.maxPages ?? 100;
    this.now = options.now ?? Date.now;
    if (!Number.isFinite(this.maxAge) || this.maxAge <= 0 || !Number.isInteger(this.attempts) || this.attempts < 1 || this.attempts > 3
      || !Number.isInteger(this.maxPages) || this.maxPages < 1 || this.maxPages > 1000) throw new Error('Invalid bounded reader options.');
  }

  get snapshot(): PositionSnapshot | null {
    if (this.cached && this.cached.ledger.ageSeconds + (this.now() - Date.parse(this.cached.ledger.readAt)) / 1000 > this.maxAge) this.cached = null;
    return this.cached ? structuredClone(this.cached) : null;
  }

  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const running = this.tail.then(operation);
    this.tail = running.catch(() => undefined);
    return running;
  }

  private async request(request: ReadRequest): Promise<Record<string, unknown>> {
    for (let attempt = 1; ; attempt++) {
      try {
        const result = record((await this.transport.request(request)).result, 'RPC result');
        if (typeof result.error === 'string') throw Object.assign(new Error(result.error), { data: result });
        return result;
      } catch (error) {
        if (attempt >= this.attempts || !transient(error)) {
          const code = rpcCode(error);
          if (code) throw Object.assign(new Error(`XRPL read failed: ${code}.`), { data: { error: code } });
          throw error;
        }
        this.cached = null;
        if (!this.transport.reconnect) throw error;
        await this.transport.reconnect();
        // Check the replacement connection before trusting any replayed response.
        const result = record((await this.transport.request({ command: 'server_info' })).result, 'reconnected server_info');
        this.acceptAnchor(result.info);
      }
    }
  }

  private acceptAnchor(value: unknown): Anchor {
    const info = record(value, 'server_info');
    if (info.network_id !== TRACK1.networkId) throw new Error(`Wrong network: expected ${TRACK1.networkId}.`);
    if (!['full', 'validating', 'proposing'].includes(String(info.server_state))) throw new Error('Node is not synchronized.');
    const ledger = record(info.validated_ledger, 'validated ledger');
    if (typeof ledger.seq !== 'number' || !Number.isSafeInteger(ledger.seq) || ledger.seq < 1 || typeof ledger.hash !== 'string') throw new Error('Missing validated ledger identity.');
    if (typeof ledger.age !== 'number' || !Number.isFinite(ledger.age) || ledger.age < 0 || ledger.age > this.maxAge) throw new Error('Validated ledger is stale.');
    const anchor = { hash: identifier(ledger.hash, 'ledger hash'), index: ledger.seq, ageSeconds: ledger.age, capturedAt: this.now() };
    if (this.previousAnchor && (anchor.index < this.previousAnchor.index || (anchor.index === this.previousAnchor.index && anchor.hash !== this.previousAnchor.hash))) {
      this.cached = null;
      this.transactions.clear();
      this.previousAnchor = null;
      throw new Error('Ledger reset or out-of-order server state detected; prior state invalidated.');
    }
    this.previousAnchor = anchor;
    return anchor;
  }

  private async anchor(): Promise<Anchor> { return this.acceptAnchor((await this.request({ command: 'server_info' })).info); }

  private assertPinned(result: Record<string, unknown>, anchor: Anchor): void {
    if (result.validated !== true) throw new Error('State response is not validated.');
    if (result.ledger_hash !== anchor.hash || result.ledger_index !== anchor.index) throw new Error('Mixed ledger snapshot: response identity does not match the pinned ledger.');
    if (anchor.ageSeconds + (this.now() - anchor.capturedAt) / 1000 > this.maxAge) throw new Error('Pinned ledger became stale during the read.');
  }

  private async entry(selector: Record<string, string>, type: string, anchor: Anchor): Promise<Record<string, unknown>> {
    const result = await this.request({ command: 'ledger_entry', ...selector, ledger_hash: anchor.hash, binary: false });
    this.assertPinned(result, anchor);
    const node = record(result.node, `${type} entry`);
    if (node.LedgerEntryType !== type) throw new Error(`Expected ${type} ledger entry.`);
    if (selector.index && (result.index !== selector.index || node.index !== selector.index)) throw new Error(`${type} ID mismatch.`);
    return node;
  }

  private async holding(account: string, mptId: string, anchor: Anchor): Promise<Record<string, unknown> | null> {
    let marker: unknown;
    let found: Record<string, unknown> | null = null;
    const seen = new Set<string>();
    for (let page = 0; page < this.maxPages; page++) {
      const result = await this.request({ command: 'account_objects', account, type: 'mptoken', ledger_hash: anchor.hash, limit: 200, ...(marker === undefined ? {} : { marker }) });
      this.assertPinned(result, anchor);
      if (result.account !== account || !Array.isArray(result.account_objects)) throw new Error('Invalid shareholder account response.');
      for (const object of result.account_objects) {
        const holding = record(object, 'MPToken holding');
        if (holding.MPTokenIssuanceID !== mptId) continue;
        if (holding.LedgerEntryType !== 'MPToken' || holding.Account !== account || found) throw new Error('Shareholder association is invalid or duplicated.');
        found = holding;
      }
      marker = result.marker;
      if (marker === undefined || marker === null) return found;
      const key = JSON.stringify(marker);
      if (seen.has(key)) throw new Error('Repeated account_objects pagination marker.');
      seen.add(key);
    }
    throw new Error('Shareholder pagination exceeds the bounded page limit.');
  }

  readPosition(input: PositionInput): Promise<PositionSnapshot> {
    return this.serial(async () => {
      this.cached = null;
      try { return await this.readPositionSnapshot(input); }
      catch (error) { this.cached = null; throw error; }
    });
  }

  private async readPositionSnapshot(input: PositionInput): Promise<PositionSnapshot> {
    const vaultId = identifier(input.vaultId, 'vault ID');
    if (!isValidClassicAddress(input.holder)) throw new Error('Invalid holder classic address.');
    if (input.loanId && !input.loanBrokerId) throw new Error('A loan requires its broker ID to verify the vault association.');
    const anchor = await this.anchor();
    const vault = await this.entry({ index: vaultId }, 'Vault', anchor);
    const asset = record(vault.Asset, 'vault Asset');
    if (asset.currency !== 'XRP' || asset.issuer !== undefined || asset.mpt_issuance_id !== undefined) throw new Error('Only XRP vault assets are supported.');
    if (typeof vault.ShareMPTID !== 'string' || !/^[A-F0-9]{48}$/.test(vault.ShareMPTID)) throw new Error('Invalid vault share issuance ID.');
    const shareMptId = vault.ShareMPTID;
    const issuance = await this.entry({ mpt_issuance: shareMptId }, 'MPTokenIssuance', anchor);
    if (issuance.mpt_issuance_id !== shareMptId || issuance.Issuer !== vault.Account) throw new Error('Vault share issuance association mismatch.');
    const holder = await this.holding(input.holder, shareMptId, anchor);
    const broker = input.loanBrokerId ? await this.entry({ index: identifier(input.loanBrokerId, 'broker ID') }, 'LoanBroker', anchor) : null;
    if (broker && broker.VaultID !== vaultId) throw new Error('Loan broker belongs to another vault.');
    const loan = input.loanId ? await this.entry({ index: identifier(input.loanId, 'loan ID') }, 'Loan', anchor) : null;
    if (loan && loan.LoanBrokerID !== input.loanBrokerId?.toUpperCase()) throw new Error('Loan belongs to another broker.');
    const scale = issuance.AssetScale ?? 0;
    if (typeof scale !== 'number' || !Number.isInteger(scale) || scale < 0 || scale > 18) throw new Error('Invalid issuance AssetScale.');
    const totalSharesRaw = shares(issuance.OutstandingAmount, 'share supply');
    const heldSharesRaw = shares(holder?.MPTAmount, 'held shares');
    if (BigInt(heldSharesRaw) > BigInt(totalSharesRaw)) throw new Error('Held shares exceed total issuance supply.');
    // Catch resets and network changes that happened while reading the pinned ledger.
    await this.anchor();
    this.assertPinned({validated:true,ledger_hash:anchor.hash,ledger_index:anchor.index}, anchor);
    const snapshot: PositionSnapshot = {
      networkId: TRACK1.networkId,
      ledger: { hash: anchor.hash, index: anchor.index, ageSeconds: anchor.ageSeconds, readAt: new Date(anchor.capturedAt).toISOString() },
      vaultId, holderAddress: input.holder, shareMptId,
      assetsTotalDrops: decimal(vault.AssetsTotal, 'AssetsTotal'),
      assetsAvailableDrops: decimal(vault.AssetsAvailable, 'AssetsAvailable'),
      lossUnrealizedDrops: decimal(vault.LossUnrealized, 'LossUnrealized'),
      totalSharesRaw, heldSharesRaw, shareScale: scale, vault, issuance, holder, broker, loan,
    };
    this.cached = structuredClone(snapshot);
    return snapshot;
  }

  /** Registers a caller-reported hash; this method does not send or verify a submission. */
  beginTracking(hash: string, lastLedgerSequence?: number): TrackedTransaction {
    const normalized = identifier(hash, 'transaction hash');
    if (lastLedgerSequence !== undefined && (!Number.isSafeInteger(lastLedgerSequence) || lastLedgerSequence < 1 || lastLedgerSequence > 4_294_967_295)) throw new Error('Invalid LastLedgerSequence.');
    const existing = this.transactions.get(normalized);
    if (existing) return { ...existing };
    const transaction: TrackedTransaction = { hash: normalized, status: 'submitted', submissionSource: 'caller-reported', economicSuccess: 'unverified', ...(lastLedgerSequence === undefined ? {} : {lastLedgerSequence}) };
    this.transactions.set(normalized, transaction);
    return { ...transaction };
  }

  pollTransaction(hash: string): Promise<TrackedTransaction> {
    return this.serial(async () => {
      try { return await this.readTransaction(identifier(hash, 'transaction hash')); }
      catch (error) { this.cached = null; throw error; }
    });
  }

  private async readTransaction(hash: string): Promise<TrackedTransaction> {
    const tracked = this.transactions.get(hash);
    if (!tracked) throw new Error('Call beginTracking before polling a transaction.');
    let anchor = await this.anchor();
    if (tracked.status === 'validated-success' || tracked.status === 'validated-failure') return { ...tracked };
    // An explanation belongs to its observed state, not the next lookup outcome.
    const { note: _previousNote, ...next } = tracked;
    let result: Record<string, unknown>;
    try { result = await this.request({ command: 'tx', transaction: hash, binary: false }); }
    catch (error) {
      if (rpcCode(error) !== 'txnNotFound') throw error;
      anchor = await this.anchor();
      const expired = tracked.lastLedgerSequence !== undefined && anchor.index > tracked.lastLedgerSequence;
      const state: TrackedTransaction = { ...next, status: expired ? 'expired-not-found' : 'pending', note: expired ? 'LastLedgerSequence has passed and this server did not find the transaction. This is not a validated failure or proof of complete historical absence.' : 'Not yet found; validation remains unknown.' };
      this.transactions.set(hash, state);
      return { ...state };
    }
    anchor = await this.anchor();
    if (result.validated !== true) {
      const pending: TrackedTransaction = { ...next, status: 'pending' };
      this.transactions.set(hash, pending);
      return { ...pending };
    }
    if (result.hash !== hash || typeof result.ledger_index !== 'number' || !Number.isSafeInteger(result.ledger_index) || result.ledger_index < 1 || result.ledger_index > anchor.index) throw new Error('Invalid validated transaction identity or ledger index.');
    const meta = record(result.meta, 'validated transaction metadata');
    if (typeof meta.TransactionResult !== 'string' || !/^(tesSUCCESS|tec[A-Z0-9_]+)$/.test(meta.TransactionResult)) throw new Error('Missing or invalid validated transaction result code.');
    const tx = result.tx_json === undefined ? result : record(result.tx_json, 'transaction JSON');
    if (typeof tx.TransactionType !== 'string') throw new Error('Missing validated transaction type.');
    const state: TrackedTransaction = { ...next, status: meta.TransactionResult === 'tesSUCCESS' ? 'validated-success' : 'validated-failure', resultCode: meta.TransactionResult, ledgerIndex: result.ledger_index, transactionType: tx.TransactionType, economicSuccess: 'unverified' };
    if (tx.TransactionType === 'Batch') state.note = 'Outer Batch validation alone does not prove inner transfers or economic settlement; inspect inner results and balance changes.';
    this.transactions.set(hash, state);
    return { ...state };
  }
}
