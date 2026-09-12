import { BatchFlags, GlobalFlags, signMultiBatch, type SubmittableTransaction, type Wallet } from "xrpl";
import type { Offer } from "./offers";
import type { MarketAttempt } from "./market-contract";

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid prepared transaction.");
  return value as Record<string, unknown>;
}
function only(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new Error("Prepared transaction contains unexpected fields.");
}
/** Verify exact reviewed terms before either local wallet signs server-supplied bytes. */
export function validatePreparedSale(offer: Offer, attempt: MarketAttempt): Record<string, unknown> {
  if (offer.network !== 4001 || attempt.offerId !== offer.id || attempt.buyer === offer.seller) throw new Error("Prepared request does not belong to this offer on network 4001.");
  const batch = structuredClone(object(attempt.batch));
  only(batch, ["TransactionType", "Account", "NetworkID", "Flags", "Sequence", "Fee", "LastLedgerSequence", "SigningPubKey", "RawTransactions", "BatchSigners"]);
  if (batch.TransactionType !== "Batch" || batch.Account !== offer.seller || batch.NetworkID !== 4001 || batch.Flags !== BatchFlags.tfAllOrNothing || (batch.SigningPubKey !== undefined && batch.SigningPubKey !== "")) throw new Error("Prepared Batch does not match this sale.");
  if (!Number.isSafeInteger(batch.Sequence) || Number(batch.Sequence) < 1 || Number(batch.Sequence) > 4_294_967_295 || !Number.isSafeInteger(batch.LastLedgerSequence) || Number(batch.LastLedgerSequence) < 1 || Number(batch.LastLedgerSequence) > 4_294_967_295 || batch.LastLedgerSequence !== attempt.lastLedgerSequence) throw new Error("Prepared Batch has invalid sequence bounds.");
  if (typeof batch.Fee !== "string" || !/^[1-9]\d*$/.test(batch.Fee) || BigInt(batch.Fee) > 1_000_000n) throw new Error("Prepared Batch fee exceeds the 1 XRP signing limit.");
  if (!Array.isArray(batch.RawTransactions) || batch.RawTransactions.length !== 2) throw new Error("Exactly two payment legs are required.");
  batch.RawTransactions.forEach((wrapper, index) => {
    const entry = object(wrapper); only(entry, ["RawTransaction"]);
    const leg = object(entry.RawTransaction);
    only(leg, ["TransactionType", "Account", "Destination", "Amount", "Flags", "Sequence", "Fee", "SigningPubKey", "NetworkID"]);
    if (leg.TransactionType !== "Payment" || leg.Flags !== GlobalFlags.tfInnerBatchTxn || leg.Fee !== "0" || leg.SigningPubKey !== "" || (leg.NetworkID !== undefined && leg.NetworkID !== 4001) || !Number.isSafeInteger(leg.Sequence) || Number(leg.Sequence) < 1 || Number(leg.Sequence) > 4_294_967_295) throw new Error("Unexpected payment signing fields.");
    if (index === 0) {
      if (leg.Account !== attempt.buyer || leg.Destination !== offer.seller || leg.Amount !== offer.priceDrops) throw new Error("Buyer payment does not match the agreed price.");
    } else {
      const amount = object(leg.Amount); only(amount, ["mpt_issuance_id", "value"]);
      if (leg.Account !== offer.seller || leg.Destination !== attempt.buyer || amount.mpt_issuance_id !== offer.shareMptId || amount.value !== offer.shares) throw new Error("Share delivery does not match the reviewed position.");
    }
  });
  if (attempt.status === "awaiting-buyer") {
    if (batch.BatchSigners !== undefined) throw new Error("The unsigned request already contains a signature.");
  } else {
    if (!Array.isArray(batch.BatchSigners) || batch.BatchSigners.length !== 1) throw new Error("Exactly one buyer signature is required.");
    const wrapper = object(batch.BatchSigners[0]); only(wrapper, ["BatchSigner"]);
    const signature = object(wrapper.BatchSigner); only(signature, ["Account", "SigningPubKey", "TxnSignature"]);
    if (signature.Account !== attempt.buyer || typeof signature.SigningPubKey !== "string" || typeof signature.TxnSignature !== "string") throw new Error("Missing buyer signature.");
  }
  return batch;
}
export function signBuyerSale(offer: Offer, attempt: MarketAttempt, wallet: Wallet): Record<string, unknown> {
  if (wallet.classicAddress !== attempt.buyer || attempt.status !== "awaiting-buyer") throw new Error("Connect the buyer wallet for this request.");
  const batch = validatePreparedSale(offer, attempt);
  signMultiBatch(wallet, batch as never);
  return batch;
}
export function signSellerSale(offer: Offer, attempt: MarketAttempt, wallet: Wallet): string {
  if (wallet.classicAddress !== offer.seller || attempt.status !== "awaiting-seller") throw new Error("Connect the seller wallet to approve this sale.");
  const batch = validatePreparedSale(offer, attempt);
  return wallet.sign(batch as unknown as SubmittableTransaction).tx_blob;
}
