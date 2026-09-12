import { BatchFlags, GlobalFlags, decode, deriveAddress, encode, encodeForSigningBatch, hashes, verifyKeypairSignature, verifySignature, type Transaction } from 'xrpl';
import { asObject, canonical, exactKeys } from './market-types.js';
import type { Offer } from './offers.js';

function boundedSequence(value: unknown): boolean { return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 4_294_967_295; }
function onlyFields(value: Record<string,unknown>, allowed: string[]): void {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new Error('Unexpected transaction fields.');
}
export function assertPreparedBatch(batch: Record<string, unknown>, offer: Offer): void {
  onlyFields(batch,['TransactionType','Account','NetworkID','Flags','Sequence','Fee','LastLedgerSequence','SigningPubKey','RawTransactions']);
  if (batch.TransactionType !== 'Batch' || batch.Account !== offer.seller || batch.NetworkID !== 4001 || batch.Flags !== BatchFlags.tfAllOrNothing || !boundedSequence(batch.Sequence) || !boundedSequence(batch.LastLedgerSequence) || Number(batch.LastLedgerSequence) <= (offer.settlement?.ledger.index ?? 0) || Number(batch.LastLedgerSequence) > (offer.settlement?.ledger.index ?? 0) + 128 || typeof batch.Fee !== 'string' || !/^[1-9]\d{0,6}$/.test(batch.Fee) || BigInt(batch.Fee) > 1_000_000n || (batch.SigningPubKey !== undefined && batch.SigningPubKey !== '')) throw new Error('Invalid prepared Batch terms or fee.');
  if (!Array.isArray(batch.RawTransactions) || batch.RawTransactions.length !== 2 || !offer.settlement) throw new Error('Expected exactly two settlement legs.');
  const expected = [
    {Account:offer.settlement.buyer,Destination:offer.seller,Amount:offer.priceDrops},
    {Account:offer.seller,Destination:offer.settlement.buyer,Amount:{mpt_issuance_id:offer.shareMptId,value:offer.sharesRaw}},
  ];
  batch.RawTransactions.forEach((raw,index) => {
    const wrapper=asObject(raw); exactKeys(wrapper,['RawTransaction']); const tx=asObject(wrapper.RawTransaction);
    onlyFields(tx,['TransactionType','Account','Destination','Amount','Flags','Sequence','Fee','SigningPubKey','NetworkID']);
    if (tx.TransactionType !== 'Payment' || tx.Flags !== GlobalFlags.tfInnerBatchTxn || !boundedSequence(tx.Sequence) || tx.Fee !== '0' || tx.SigningPubKey !== '' || (tx.NetworkID !== undefined && tx.NetworkID !== 4001) || canonical({Account:tx.Account,Destination:tx.Destination,Amount:tx.Amount}) !== canonical(expected[index])) throw new Error('Settlement leg terms do not match the offer.');
  });
}
export function acceptBuyerSignature(prepared:Record<string,unknown>, value:unknown, buyer:string):Record<string,unknown> {
  const batch=asObject(value); const {BatchSigners,...unsigned}=batch;
  if (canonical(unsigned)!==canonical(prepared) || !Array.isArray(BatchSigners) || BatchSigners.length!==1) throw new Error('Buyer-signed Batch terms changed.');
  const wrapped=asObject(BatchSigners[0]); exactKeys(wrapped,['BatchSigner']);const signer=asObject(wrapped.BatchSigner);
  exactKeys(signer,['Account','SigningPubKey','TxnSignature']);
  if (signer.Account!==buyer || typeof signer.SigningPubKey!=='string' || typeof signer.TxnSignature!=='string' || deriveAddress(signer.SigningPubKey)!==buyer) throw new Error('Invalid buyer account signature.');
  const raw=batch.RawTransactions as Array<{RawTransaction:Transaction}>;
  const signingData={account:batch.Account,sequence:batch.Sequence,flags:batch.Flags,txIDs:raw.map(tx=>hashes.hashSignedTx(tx.RawTransaction)),batchAccount:buyer};
  if (!verifyKeypairSignature(encodeForSigningBatch(signingData as unknown as Transaction),signer.TxnSignature,signer.SigningPubKey)) throw new Error('Invalid buyer signature.');
  return structuredClone(batch);
}
export function acceptSellerSignature(expected:Record<string,unknown>, blob:unknown, seller:string):{batch:Record<string,unknown>;blob:string;hash:string} {
  if(typeof blob!=='string' || blob.length>32768 || !/^[A-Fa-f0-9]+$/.test(blob)) throw new Error('Invalid signed transaction blob.');
  const batch=decode(blob);const {SigningPubKey,TxnSignature,...terms}=batch;
  const {SigningPubKey:_empty,...expectedTerms}=expected;
  if(canonical(terms)!==canonical(expectedTerms))throw new Error('Seller-signed transaction terms changed.');
  if(typeof SigningPubKey!=='string' || typeof TxnSignature!=='string' || deriveAddress(SigningPubKey)!==seller || !verifySignature(blob))throw new Error('Invalid seller signature.');
  if(encode(batch as unknown as Transaction)!==blob.toUpperCase())throw new Error('Noncanonical signed transaction.');
  return {batch,blob:blob.toUpperCase(),hash:hashes.hashSignedTx(blob)};
}
