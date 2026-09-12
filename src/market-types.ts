import type { CreateOfferInput, Offer } from './offers.js';
export type MarketAction =
  | { type: 'create'; input: CreateOfferInput }
  | { type: 'cancel' | 'prepare' | 'reconcile'; offerId: string }
  | { type: 'buyer-sign'; offerId: string; batch: Record<string, unknown> }
  | { type: 'seller-submit'; offerId: string; txBlob: string };
export interface MarketChallenge { id: string; message: string; expiresAt: string }
export interface MarketEnvelope { challengeId: string; publicKey: string; signature: string }
export interface MarketAttempt {
  offerId: string; id: string; buyer: string;
  status: 'awaiting-buyer' | 'awaiting-seller' | 'submitting' | 'pending' | 'settled' | 'failed';
  batch: Record<string, unknown> | null; hash: string | null; lastLedgerSequence: number | null; message: string | null;
}
export interface StoredAttempt extends MarketAttempt { revision: number; blob: string | null }
export interface MarketSnapshot { offers: Offer[]; attempts: MarketAttempt[] }
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object.');
  return value as Record<string, unknown>;
}
export function exactKeys(value: Record<string, unknown>, keys: string[]): void {
  if (Object.keys(value).some(key => !keys.includes(key)) || keys.some(key => !Object.hasOwn(value,key))) throw new Error('Unexpected or missing fields.');
}
