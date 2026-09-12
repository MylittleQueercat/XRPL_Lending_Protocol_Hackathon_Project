/** Explicit browser verification fixture. Seller/buyer sign only in their browsers.
 * This process creates fresh faucet-only broker/borrower keys in memory and never
 * prints, persists or loads any wallet seed. Run only with --start after UI setup. */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { isValidClassicAddress, LoanPayFlags, signLoanSetByCounterparty, type AccountObjectsRequest, type LoanSet, type SubmittableTransaction, type Wallet } from 'xrpl';
import { createClient, inspectNetwork } from '../src/network.js';
import { assertValidated, record, TRACK1 } from '../src/core.js';
import { buildVaultCreate, parseFaucetWallet, readBalance } from '../src/vault.js';
import { buildLoanBrokerSet, buildLoanSet, createdEntry } from '../src/lending.js';
import { createRunDirectory } from '../src/storage.js';
import { verifyBatchSettlement } from '../src/market-ledger.js';
import type { MarketSnapshot, StoredAttempt } from '../src/market-types.js';

const argv=process.argv.slice(2);
if(argv.includes('--help') || !argv.includes('--start')) {
  process.stdout.write('Usage: npx tsx scripts/browser-fixture.ts --start --seller CLASSIC_ADDRESS --buyer CLASSIC_ADDRESS [--origin http://127.0.0.1:3100]\nNo network operation occurs without --start. Operator wallets remain in memory only.\n');
  process.exit(0);
}
function arg(name:string):string|undefined {const i=argv.indexOf(name);return i<0?undefined:argv[i+1];}
const seller=arg('--seller'),buyer=arg('--buyer'),origin=arg('--origin')??'http://127.0.0.1:3100';
if(!seller || !buyer || !isValidClassicAddress(seller) || !isValidClassicAddress(buyer) || seller===buyer)throw new Error('Provide distinct valid seller and buyer public addresses.');
const parsedOrigin=new URL(origin);
if(!['localhost','127.0.0.1'].includes(parsedOrigin.hostname) || parsedOrigin.origin!==origin)throw new Error('The fixture reads only a localhost Raise application.');
const output='evidence/browser-market-e2e.json';
if(existsSync(output))throw new Error('Browser evidence already exists; preserve it before explicitly starting a fresh fixture.');
const client=createClient();
const directory=await createRunDirectory('browser-fixture');
const transactions:Array<Record<string,unknown>>=[],snapshots:Array<Record<string,unknown>>=[],intents:Array<Record<string,unknown>>=[];
let stage='starting';let vaultId='',shareMptId='',loanId='';
const publicActors:Record<string,string>={seller,buyer};
async function progress(extra:Record<string,unknown>={}) {
  const value={stage,checkedAt:new Date().toISOString(),networkId:4001,origin,actors:publicActors,vaultId,shareMptId,loanId,transactions,snapshots,intents,...extra};
  await writeFile(join(directory,'progress.json'),`${JSON.stringify(value,null,2)}\n`,{mode:0o600});
}
function print(extra:Record<string,unknown>={}){process.stdout.write(`${JSON.stringify({stage,vaultId,shareMptId,loanId,...extra})}\n`);}
async function fundOperator():Promise<Wallet>{
  const response=await fetch(TRACK1.faucetUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(30000)});
  if(!response.ok){await response.body?.cancel();throw new Error('Event faucet funding failed. No automatic faucet retry.');}
  const wallet=parseFaucetWallet(await response.json());
  for(let poll=0;poll<30;poll++){
    try{if(BigInt(await readBalance(client,wallet.address))>=100000000n)return wallet;}catch(error){const data=error && typeof error==='object' && 'data' in error?error.data:null;if(!data || typeof data!=='object' || !('error' in data) || data.error!=='actNotFound')throw error;}
    await delay(1000);
  }
  throw new Error('Operator faucet funding was not validated; no retry.');
}
async function submit(label:string,tx:SubmittableTransaction,wallet:Wallet,counterparty?:Wallet){
  const prepared=await client.autofill(tx);assert.equal(prepared.NetworkID,4001);
  let signed=wallet.sign(prepared);
  if(counterparty)signed=signLoanSetByCounterparty(counterparty,signed.tx_blob as unknown as LoanSet);
  intents.push({label,hash:signed.hash,lastLedgerSequence:prepared.LastLedgerSequence});await progress();
  const response=(await client.submitAndWait(signed.tx_blob)).result;
  const verified=assertValidated(response);assert.equal(verified.hash,signed.hash);
  const meta=record(response.meta,'validated metadata');
  const evidence={label,transactionType:tx.TransactionType,hash:signed.hash,ledgerIndex:verified.ledgerIndex,resultCode:'tesSUCCESS',feeDrops:prepared.Fee,explorer:`${TRACK1.explorerUrl}/transactions/${signed.hash}`};
  transactions.push(evidence);await progress();print({transaction:evidence});return {...evidence,meta};
}
async function entry(index:string,ledgerIndex:number){const result=(await client.request({command:'ledger_entry',index,ledger_index:ledgerIndex})).result;assert.equal(result.validated,true);return record(result.node,'ledger entry');}
async function shares(account:string,ledgerIndex:number):Promise<string>{
  let marker:unknown;
  for(let page=0;page<100;page++){
    const result=(await client.request({command:'account_objects',account,type:'mptoken',ledger_index:ledgerIndex,...(marker===undefined?{}:{marker})} as AccountObjectsRequest)).result;
    assert.equal(result.validated,true);
    for(const value of result.account_objects){const node=record(value,'holding');if(node.MPTokenIssuanceID===shareMptId)return String(node.MPTAmount??'0');}
    marker=result.marker;if(marker===undefined)return '0';
  }
  throw new Error('Share holding pagination exceeded its bound.');
}
async function snapshot(){
  const info=(await client.request({command:'server_info'})).result.info;assert.equal(info.network_id,4001);assert(info.validated_ledger && info.validated_ledger.age<=30);
  const ledgerIndex=info.validated_ledger.seq;const vault=await entry(vaultId,ledgerIndex);
  const issuance=(await client.request({command:'ledger_entry',mpt_issuance:shareMptId,ledger_index:ledgerIndex})).result;assert.equal(issuance.validated,true);
  const [sellerShares,buyerShares,sellerXrp,buyerXrp]=await Promise.all([shares(seller!,ledgerIndex),shares(buyer!,ledgerIndex),readBalance(client,seller!,ledgerIndex),readBalance(client,buyer!,ledgerIndex)]);
  return {ledgerIndex,sellerShares,buyerShares,sellerXrp,buyerXrp,assetsAvailableDrops:String(vault.AssetsAvailable??'0'),assetsTotalDrops:String(vault.AssetsTotal??'0'),totalShares:String(record(issuance.node,'issuance').OutstandingAmount??'0')};
}
async function waitFor(predicate:(value:Awaited<ReturnType<typeof snapshot>>)=>boolean){
  for(let poll=0;poll<1800;poll++){
    const value=await snapshot();if(predicate(value)){snapshots.push({label:stage,...value});await progress();return value;}
    if(poll%12===0)print({waiting:true,ledgerIndex:value.ledgerIndex,sellerShares:value.sellerShares,buyerShares:value.buyerShares,assetsAvailableDrops:value.assetsAvailableDrops});
    await delay(2500);
  }
  throw new Error('Browser fixture wait timed out; no automatic financial retry.');
}
async function market():Promise<MarketSnapshot>{
  const response=await fetch(`${origin}/api/market`,{signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error('Local shared marketplace is unavailable.');return await response.json() as MarketSnapshot;
}
async function collectBrowserTransactions(account:string,min:number,max:number){
  let marker:unknown;
  for(let page=0;page<100;page++){
    const result=(await client.request({command:'account_tx',account,ledger_index_min:min,ledger_index_max:max,forward:true,limit:100,...(marker===undefined?{}:{marker})})).result;
    for(const item of result.transactions){
      if(!item.validated || !item.tx_json || typeof item.meta==='string')continue;
      const tx=item.tx_json as unknown as Record<string,unknown>;
      if(tx.Account!==account || !['VaultDeposit','VaultWithdraw','MPTokenAuthorize'].includes(String(tx.TransactionType)))continue;
      if(tx.VaultID!==vaultId && tx.MPTokenIssuanceID!==shareMptId)continue;
      assert(typeof item.hash==='string');
      if(!transactions.some(t=>t.hash===item.hash))transactions.push({label:`browser-${String(tx.TransactionType)}`,transactionType:tx.TransactionType,account,hash:item.hash,ledgerIndex:item.ledger_index,resultCode:item.meta.TransactionResult,feeDrops:tx.Fee,explorer:`${TRACK1.explorerUrl}/transactions/${item.hash}`});
    }
    marker=result.marker;if(marker===undefined)return;
  }
  throw new Error('Browser transaction history exceeded its bound.');
}
try{
  const network=await inspectNetwork(client);assert.equal(network.networkId,4001);assert(network.vanillaReady);
  await market();await Promise.all([readBalance(client,seller),readBalance(client,buyer)]);
  const broker=await fundOperator(),borrower=await fundOperator();publicActors.broker=broker.address;publicActors.borrower=borrower.address;
  stage='creating-vault';const created=await submit('fixture-create-vault',buildVaultCreate(broker.address),broker);vaultId=createdEntry(created.meta,'Vault');
  shareMptId=String((await entry(vaultId,created.ledgerIndex)).ShareMPTID);
  stage='waiting-for-seller-ui-deposit';await progress();print({instruction:'Seller: deposit exactly 100 XRP using the browser UI.',actors:publicActors});
  const deposited=await waitFor(s=>s.sellerShares==='100000000' && s.assetsAvailableDrops==='100000000' && s.totalShares==='100000000');
  await collectBrowserTransactions(seller,created.ledgerIndex,deposited.ledgerIndex);
  stage='originating-50-xrp-loan';
  const brokerSet=await submit('fixture-create-broker',buildLoanBrokerSet(broker.address,vaultId),broker);const brokerId=createdEntry(brokerSet.meta,'LoanBroker');
  await submit('fixture-cover',{TransactionType:'LoanBrokerCoverDeposit',Account:broker.address,LoanBrokerID:brokerId,Amount:'20000000'} as SubmittableTransaction,broker);
  const loan=await submit('fixture-originate-loan',buildLoanSet(broker.address,borrower.address,brokerId),broker,borrower);loanId=createdEntry(loan.meta,'Loan');
  const afterLoan=await snapshot();assert.equal(afterLoan.assetsAvailableDrops,'50000000');snapshots.push({label:'after-loan',...afterLoan});
  stage='waiting-for-browser-market-sale';await progress();print({instruction:'Seller: verify withdrawal limitation and list all 100000000 shares for 95 XRP. Buyer and seller approve separately in their browsers.'});
  const sold=await waitFor(s=>s.buyerShares==='100000000' && s.sellerShares==='0');
  const current=await market();const offer=current.offers.find(o=>o.vaultId===vaultId && o.seller===seller && o.settlement?.buyer===buyer);assert(offer,'No matching browser marketplace offer.');
  const attempt=current.attempts.find(a=>a.offerId===offer.id);assert(attempt?.hash,'No exact browser settlement hash.');
  // Submitted signatures are private in Raise snapshots. Read the exact validated
  // transaction from the ledger to independently verify the public settlement.
  const outer=(await client.request({command:'tx',transaction:attempt.hash})).result;
  assert.equal(outer.validated,true);assert.equal(outer.hash,attempt.hash);
  // These RPC presentation fields are not serialized transaction fields.
  const {ctid:_ctid,date:_date,ledger_index:_ledgerIndex,...batch}=record(outer.tx_json,'validated browser Batch');
  const proofResult=await verifyBatchSettlement(offer,{...attempt,batch,revision:0,blob:null} as StoredAttempt,request=>client.request(request as Parameters<typeof client.request>[0]));
  assert.equal(proofResult.status,'settled','Both browser sale legs must verify before borrower repayment.');if(proofResult.status!=='settled')throw new Error('Browser sale is not verified.');
  transactions.push({label:'browser-shared-market-sale',transactionType:'Batch',hash:proofResult.proof.transactionHash,ledgerIndex:proofResult.proof.ledgerIndex,resultCode:'tesSUCCESS',explorer:`${TRACK1.explorerUrl}/transactions/${proofResult.proof.transactionHash}`});
  await collectBrowserTransactions(seller,created.ledgerIndex,sold.ledgerIndex);await collectBrowserTransactions(buyer,created.ledgerIndex,sold.ledgerIndex);
  assert(transactions.some(t=>t.account===seller && t.transactionType==='VaultDeposit' && t.resultCode==='tesSUCCESS'),'Seller browser deposit must be validated.');
  assert(transactions.some(t=>t.account===seller && t.transactionType==='VaultWithdraw' && t.resultCode==='tecINSUFFICIENT_FUNDS'),'Seller browser withdrawal must demonstrate unavailable vault cash.');
  stage='repaying-fixture-loan';await submit('fixture-full-repayment',{TransactionType:'LoanPay',Account:borrower.address,LoanID:loanId,Amount:'200000000',Flags:LoanPayFlags.tfLoanFullPayment} as SubmittableTransaction,borrower);
  const repaid=await snapshot();assert(BigInt(repaid.assetsAvailableDrops)>=100000000n);snapshots.push({label:'after-repayment',...repaid});
  stage='waiting-for-buyer-ui-redemption';await progress();print({instruction:'Buyer: refresh the position and withdraw the entire available amount using the browser UI.',availableDrops:repaid.assetsAvailableDrops});
  const final=await waitFor(s=>s.buyerShares==='0' && s.totalShares==='0' && s.assetsAvailableDrops==='0');
  await collectBrowserTransactions(buyer,created.ledgerIndex,final.ledgerIndex);
  const withdrawal=transactions.find(t=>t.account===buyer && t.transactionType==='VaultWithdraw' && t.resultCode==='tesSUCCESS');assert(withdrawal,'No validated browser buyer withdrawal found.');
  assert.equal(BigInt(final.buyerXrp)-BigInt(repaid.buyerXrp)+BigInt(String(withdrawal.feeDrops)),BigInt(repaid.assetsAvailableDrops));
  stage='passed';await mkdir('evidence',{recursive:true});
  const evidence={checkedAt:new Date().toISOString(),scope:'Two independent browser wallets perform deposit, shared offer signatures and final redemption; fresh in-memory operator wallets provide the lending fixture.',networkId:4001,sdk:'xrpl@5.2.0-beta.1',node:process.version,origin,actors:publicActors,vaultId,shareMptId,loanId,offerId:offer.id,settlementProof:proofResult.proof,transactions,snapshots,result:'passed'};
  await writeFile(output,`${JSON.stringify(evidence,null,2)}\n`,{flag:'wx'});await progress();print({evidence:output});
}catch(error){stage='stopped';await progress({errorClass:error instanceof Error?error.name:'UnknownError'});print({message:'Fixture stopped. Inspect sanitized progress and known hashes; never resubmit blindly.',progressFile:join(directory,'progress.json'),error:error instanceof Error?error.message:'Unknown failure'});process.exitCode=1;}
finally{if(client.isConnected())await client.disconnect();}
