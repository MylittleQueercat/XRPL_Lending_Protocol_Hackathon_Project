import type { CreateOfferInput, Offer } from '../../../src/offers.js';

export type { CreateOfferInput, Offer };
export type MarketAction =
  | { type: 'create'; input: CreateOfferInput }
  | { type: 'cancel' | 'prepare' | 'reconcile'; offerId: string }
  | { type: 'buyer-sign'; offerId: string; batch: Record<string, unknown> }
  | { type: 'seller-submit'; offerId: string; txBlob: string };
export interface MarketChallenge { id: string; message: string; expiresAt: string }
export interface MarketEnvelope { challengeId: string; publicKey: string; signature: string }
export interface MarketAttempt {
  offerId: string;
  id: string;
  buyer: string;
  status: 'awaiting-buyer' | 'awaiting-seller' | 'submitting' | 'pending' | 'settled' | 'failed';
  batch: Record<string, unknown> | null;
  hash: string | null;
  lastLedgerSequence: number | null;
  message: string | null;
}
export interface MarketSnapshot { offers: Offer[]; attempts: MarketAttempt[] }
