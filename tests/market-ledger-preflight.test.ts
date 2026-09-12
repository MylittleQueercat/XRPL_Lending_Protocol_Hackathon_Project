import { describe, expect, it, vi } from 'vitest';
import { checkBuyerReceipt } from '../src/market-ledger.js';
import { LedgerReader, type ReadRequest } from '../src/ledger-reader.js';
import type { Offer } from '../src/offers.js';

const buyer='rLNzsCg1LPnytzSdf4hLk7inC58BFzuX6J';
const vaultId='A'.repeat(64),shareMptId='B'.repeat(48),hash='C'.repeat(64);
const offer={networkId:4001,vaultId,shareMptId} as Offer;
function fixture() {
  const state={network:4001,validated:true,age:1,absent:false,holderFlags:0,issuanceFlags:32,holderIssuance:shareMptId,issuer:'vault-account',vaultShare:shareMptId,domain:false};
  const request=vi.fn(async(req:ReadRequest):Promise<{result:unknown}>=>{
    if(req.command==='server_info')return {result:{info:{network_id:state.network,server_state:'full',validated_ledger:{seq:100,hash,age:state.age}}}};
    const base={validated:state.validated,ledger_index:100,ledger_hash:hash};
    if(req.command==='account_objects')return {result:{...base,account:buyer,account_objects:state.absent?[]:[{LedgerEntryType:'MPToken',Account:buyer,MPTokenIssuanceID:state.holderIssuance,MPTAmount:'0',Flags:state.holderFlags}]}};
    const node=req.index===vaultId
      ?{LedgerEntryType:'Vault',index:vaultId,Account:'vault-account',Asset:{currency:'XRP'},ShareMPTID:state.vaultShare,AssetsTotal:'1000',AssetsAvailable:'0'}
      :{LedgerEntryType:'MPTokenIssuance',Issuer:state.issuer,mpt_issuance_id:state.vaultShare,OutstandingAmount:'1000',Flags:state.issuanceFlags,...(state.domain?{DomainID:'D'.repeat(64)}:{})};
    return {result:{...base,index:node.index,node}};
  });
  const reader=new LedgerReader({request});
  return {state,request,check:()=>checkBuyerReceipt(offer,buyer,input=>reader.readPosition(input))};
}
describe('validated buyer receipt preflight',()=>{
  it('accepts a zero-balance holder of transferable unrestricted vault shares',async()=>{
    const f=fixture();await expect(f.check()).resolves.toBeUndefined();
    for(const [request] of f.request.mock.calls.filter(([r])=>r.command!=='server_info'))expect(request.ledger_hash).toBe(hash);
  });
  it.each(['absent','unvalidated','wrong-network','stale','wrong-vault-issuance','wrong-holder-issuance','wrong-issuer'] as const)('rejects %s state',async(kind)=>{
    const f=fixture();
    if(kind==='absent')f.state.absent=true;
    if(kind==='unvalidated')f.state.validated=false;
    if(kind==='wrong-network')f.state.network=1;
    if(kind==='stale')f.state.age=31;
    if(kind==='wrong-vault-issuance')f.state.vaultShare='E'.repeat(48);
    if(kind==='wrong-holder-issuance')f.state.holderIssuance='E'.repeat(48);
    if(kind==='wrong-issuer')f.state.issuer='unrelated';
    await expect(f.check()).rejects.toThrow();
  });
  it.each([
    {issuance:0,holder:0,error:/transfers/},
    {issuance:33,holder:0,error:/locked/},
    {issuance:32,holder:1,error:/locked/},
    {issuance:36,holder:0,error:/issuer authorization/},
    {issuance:36,holder:1,error:/locked/},
    {issuance:36,holder:3,error:/locked/},
    {issuance:-1,holder:0,error:/flags/},
    {issuance:32,holder:0.5,error:/flags/},
  ])('rejects issuance flags $issuance / holder flags $holder',async({issuance,holder,error})=>{
    const f=fixture();f.state.issuanceFlags=issuance;f.state.holderFlags=holder;
    await expect(f.check()).rejects.toThrow(error);
  });
  it('accepts explicitly authorized allow-listed holders',async()=>{
    const f=fixture();f.state.issuanceFlags=36;f.state.holderFlags=2;
    await expect(f.check()).resolves.toBeUndefined();
  });
  it('does not infer domain eligibility from the presence of a holding',async()=>{
    const f=fixture();f.state.issuanceFlags=36;f.state.domain=true;
    await expect(f.check()).rejects.toThrow(/domain-based eligibility is not verified/);
  });
});
