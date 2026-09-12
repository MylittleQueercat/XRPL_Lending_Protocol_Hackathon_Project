import { describe, expect, it, vi } from 'vitest';
import { LedgerReader, type ReadRequest } from '../src/ledger-reader.js';
const hash = 'A'.repeat(64), vaultId = 'B'.repeat(64), brokerId = 'C'.repeat(64), loanId = 'D'.repeat(64), mpt = 'E'.repeat(48), txHash = 'F'.repeat(64);
const holder = 'rLNzsCg1LPnytzSdf4hLk7inC58BFzuX6J';
function fixture() {
  const state = { index: 100, hash, age: 1, network: 4001, failOnce: false, validated: true, mixed: false, absent: false, accountError: false, mismatch: false, tx: 'not-found', batch: false };
  const request = vi.fn(async (req: ReadRequest): Promise<{result: unknown}> => {
    if (state.failOnce) { state.failOnce = false; throw Object.assign(new Error('socket closed'), {code:'ECONNRESET'}); }
    if (req.command === 'server_info') return {result:{info:{network_id:state.network,server_state:'full',validated_ledger:{seq:state.index,hash:state.hash,age:state.age}}}};
    const base = {validated:state.validated,ledger_index:state.index,ledger_hash:state.mixed ? '9'.repeat(64) : state.hash};
    if (req.command === 'tx') {
      if (state.tx === 'not-found') throw {data:{error:'txnNotFound'}};
      return {result:{...base,validated:state.tx !== 'pending',hash:txHash,tx_json:{TransactionType:state.batch?'Batch':'Payment'},meta:{TransactionResult:state.tx==='fail'?'tecUNFUNDED_PAYMENT':'tesSUCCESS'}}};
    }
    if (req.command === 'account_objects') {
      if (state.accountError) throw {data:{error:'actNotFound'}};
      return {result:{...base,account:holder,account_objects:req.marker && !state.absent ? [{LedgerEntryType:'MPToken',Account:holder,MPTokenIssuanceID:mpt,MPTAmount:'200'}] : [],...(!req.marker?{marker:'next'}:{})}};
    }
    let node: Record<string,unknown>;
    if (req.index === vaultId) node={LedgerEntryType:'Vault',index:vaultId,Account:'vault-account',Asset:{currency:'XRP'},ShareMPTID:mpt,AssetsTotal:'1000.25',AssetsAvailable:'300',LossUnrealized:'20'};
    else if(req.index === brokerId) node={LedgerEntryType:'LoanBroker',index:brokerId,VaultID:state.mismatch?loanId:vaultId};
    else if(req.index === loanId) node={LedgerEntryType:'Loan',index:loanId,LoanBrokerID:brokerId};
    else node={LedgerEntryType:'MPTokenIssuance',Issuer:'vault-account',mpt_issuance_id:mpt,OutstandingAmount:'1000',AssetScale:6};
    return {result:{...base,index:node.index,node}};
  });
  const reconnect=vi.fn(async()=>{});
  return {state,request,reconnect,reader:new LedgerReader({request,reconnect})};
}
const input={vaultId,holder,loanBrokerId:brokerId,loanId};
describe('validated position reader',()=>{
  it('pins every state request and every holder page to a single validated hash',async()=>{
    const f=fixture(), result=await f.reader.readPosition(input);
    expect(result).toMatchObject({assetsTotalDrops:'1000.25',heldSharesRaw:'200',totalSharesRaw:'1000',shareScale:6,ledger:{hash,index:100}});
    for(const [req] of f.request.mock.calls.filter(([req])=>req.command!=='server_info')) expect(req.ledger_hash).toBe(hash);
    expect(f.request.mock.calls.filter(([r])=>r.command==='account_objects')).toHaveLength(2);
  });
  it('distinguishes absent holdings from nonexistent accounts',async()=>{
    const f=fixture();f.state.absent=true;expect((await f.reader.readPosition(input)).heldSharesRaw).toBe('0');
    f.state.accountError=true;await expect(f.reader.readPosition(input)).rejects.toThrow('actNotFound');expect(f.reader.snapshot).toBeNull();
  });
  it.each(['mixed','unvalidated','wrong-network','stale','association'] as const)('rejects %s responses',async(kind)=>{
    const f=fixture(); if(kind==='mixed')f.state.mixed=true;if(kind==='unvalidated')f.state.validated=false;if(kind==='wrong-network')f.state.network=1;if(kind==='stale')f.state.age=31;if(kind==='association')f.state.mismatch=true;
    await expect(f.reader.readPosition(input)).rejects.toThrow();expect(f.reader.snapshot).toBeNull();
  });
  it.each(['regression','same-height-change'])('invalidates a previous snapshot on %s',async(kind)=>{
    const f=fixture();await f.reader.readPosition(input);if(kind==='regression')f.state.index=99;else f.state.hash='8'.repeat(64);
    await expect(f.reader.readPosition(input)).rejects.toThrow(/reset/i);expect(f.reader.snapshot).toBeNull();
  });
  it('reconnects boundedly and replays only reads',async()=>{
    const f=fixture();f.state.failOnce=true;await f.reader.readPosition(input);expect(f.reconnect).toHaveBeenCalledTimes(1);
    expect(f.request.mock.calls.every(([r])=>['server_info','ledger_entry','account_objects'].includes(r.command))).toBe(true);
  });
  it('fails permanently disconnected reads after the bounded attempt budget',async()=>{
    const request=vi.fn(async()=>{throw Object.assign(new Error('offline'),{code:'ECONNRESET'});});const reconnect=vi.fn(async()=>{});
    await expect(new LedgerReader({request,reconnect}).readPosition(input)).rejects.toThrow('offline');expect(request).toHaveBeenCalledTimes(2);
  });
});
describe('read-only transaction lifecycle',()=>{
  it('tracks submitted to pending to validated success without submitting',async()=>{
    const f=fixture();expect(f.reader.beginTracking(txHash,105).status).toBe('submitted');
    expect((await f.reader.pollTransaction(txHash)).status).toBe('pending');f.state.tx='success';
    expect(await f.reader.pollTransaction(txHash)).toMatchObject({status:'validated-success',resultCode:'tesSUCCESS'});
    expect(f.request.mock.calls.every(([r])=>['server_info','tx'].includes(r.command))).toBe(true);
  });
  it('does not treat unvalidated tesSUCCESS or txnNotFound as a validated outcome',async()=>{
    const f=fixture();f.reader.beginTracking(txHash,105);f.state.tx='pending';expect((await f.reader.pollTransaction(txHash)).status).toBe('pending');
    f.state.tx='not-found';f.state.index=106;expect((await f.reader.pollTransaction(txHash)).status).toBe('expired-not-found');
  });
  it('distinguishes validated failure and avoids promising Batch settlement from the outer result',async()=>{
    const f=fixture();f.reader.beginTracking(txHash);f.state.tx='fail';expect((await f.reader.pollTransaction(txHash)).status).toBe('validated-failure');
    const b=fixture();b.reader.beginTracking(txHash);b.state.tx='success';b.state.batch=true;expect(await b.reader.pollTransaction(txHash)).toMatchObject({status:'validated-success',economicSuccess:'unverified'});
  });
});

describe('snapshot integrity edge cases',()=>{
  it('preserves protocol NUMBER scientific notation without rounding',async()=>{
    const f=fixture();const request=async(req:ReadRequest)=>{
      const response=await f.request(req);
      if(req.index===vaultId)(response.result as {node:Record<string,unknown>}).node.AssetsTotal='1.234567890123456789e+11';
      return response;
    };
    const result=await new LedgerReader({request}).readPosition(input);
    expect(result.assetsTotalDrops).toBe('1.234567890123456789e+11');
  });
  it('expires cached snapshots and rejects snapshots that age during pagination',async()=>{
    const f=fixture();let now=1000;
    const reader=new LedgerReader({request:f.request},{now:()=>now});await reader.readPosition(input);now+=31000;expect(reader.snapshot).toBeNull();
    const slow=new LedgerReader({request:async(req)=>{const response=await f.request(req);if(req.command==='account_objects')now+=31000;return response;}},{now:()=>now});
    await expect(slow.readPosition(input)).rejects.toThrow(/stale/);expect(slow.snapshot).toBeNull();
  });
  it('rejects unrelated share issuance and loan entries',async()=>{
    for(const field of ['issuance','loan']) {
      const f=fixture();const request=async(req:ReadRequest)=>{const response=await f.request(req);const data=response.result as {node?:Record<string,unknown>};if(field==='issuance'&&req.mpt_issuance)data.node!.Issuer='unrelated';if(field==='loan'&&req.index===loanId)data.node!.LoanBrokerID=loanId;return response;};
      await expect(new LedgerReader({request}).readPosition(input)).rejects.toThrow(/association|another broker/);
    }
  });
  it('does not regress a validated transaction to pending after a later missing lookup',async()=>{
    const f=fixture();f.reader.beginTracking(txHash);f.state.tx='success';await f.reader.pollTransaction(txHash);f.state.tx='not-found';
    expect((await f.reader.pollTransaction(txHash)).status).toBe('validated-success');
  });
  it('invalidates transaction tracking if the network resets during a lookup',async()=>{
    const f=fixture();const request=async(req:ReadRequest)=>{const result=await f.request(req);if(req.command==='tx')f.state.index=90;return result;};
    const reader=new LedgerReader({request});reader.beginTracking(txHash);f.state.tx='success';
    await expect(reader.pollTransaction(txHash)).rejects.toThrow(/reset/);
    await expect(reader.pollTransaction(txHash)).rejects.toThrow(/beginTracking/);
  });
});

describe('bounded and defensive reads',()=>{
  it('rejects repeated pagination markers and page-limit exhaustion',async()=>{
    for(const repeat of [true,false]) {
      const f=fixture();let page=0;
      const request=async(req:ReadRequest)=>{const response=await f.request(req);if(req.command==='account_objects'){const result=response.result as Record<string,unknown>;result.marker=repeat?'same':String(++page);result.account_objects=[];}return response;};
      await expect(new LedgerReader({request},{maxPages:2}).readPosition(input)).rejects.toThrow(/pagination|page limit/);
    }
  });
  it('rechecks the network after reconnecting before replaying any state lookup',async()=>{
    const f=fixture();f.state.failOnce=true;const reconnect=async()=>{f.state.network=1;};
    await expect(new LedgerReader({request:f.request,reconnect}).readPosition(input)).rejects.toThrow(/network/);
    expect(f.request.mock.calls.every(([r])=>r.command==='server_info')).toBe(true);
  });
  it('serializes concurrent snapshot requests instead of accepting out-of-order completion',async()=>{
    const f=fixture();let active=0,maxActive=0;
    const reader=new LedgerReader({request:async(req)=>{active++;maxActive=Math.max(maxActive,active);await Promise.resolve();const response=await f.request(req);active--;return response;}});
    const [first,second]=await Promise.all([reader.readPosition(input),reader.readPosition(input)]);
    expect(first.ledger.hash).toBe(second.ledger.hash);expect(maxActive).toBe(1);
  });
  it('rejects unsupported vault assets and a loan without its broker',async()=>{
    const f=fixture();const request=async(req:ReadRequest)=>{const response=await f.request(req);if(req.index===vaultId)(response.result as {node:Record<string,unknown>}).node.Asset={currency:'USD',issuer:holder};return response;};
    await expect(new LedgerReader({request}).readPosition(input)).rejects.toThrow(/Only XRP/);
    await expect(f.reader.readPosition({vaultId,holder,loanId})).rejects.toThrow(/broker/);
  });
});

describe('transaction state transition explanations', () => {
  it.each(['success', 'fail'])('clears a previous not-found note after validated %s', async (outcome) => {
    const f = fixture();
    f.reader.beginTracking(txHash, 105);
    expect((await f.reader.pollTransaction(txHash)).note).toContain('Not yet found');
    f.state.tx = outcome;
    const result = await f.reader.pollTransaction(txHash);
    expect(result.status).toBe(outcome === 'success' ? 'validated-success' : 'validated-failure');
    expect(result).not.toHaveProperty('note');
  });

  it('clears the expired explanation when a later lookup finds a pending transaction', async () => {
    const f = fixture();
    f.reader.beginTracking(txHash, 99);
    expect((await f.reader.pollTransaction(txHash)).note).toContain('LastLedgerSequence has passed');
    f.state.tx = 'pending';
    const result = await f.reader.pollTransaction(txHash);
    expect(result.status).toBe('pending');
    expect(result).not.toHaveProperty('note');
  });

  it('retains only the Batch settlement caveat after a previously missing lookup', async () => {
    const f = fixture();
    f.reader.beginTracking(txHash);
    await f.reader.pollTransaction(txHash);
    f.state.tx = 'success';
    f.state.batch = true;
    const result = await f.reader.pollTransaction(txHash);
    expect(result.note).toBe('Outer Batch validation alone does not prove inner transfers or economic settlement; inspect inner results and balance changes.');
  });

  it('bounds LastLedgerSequence to a positive uint32', () => {
    const f = fixture();
    expect(() => f.reader.beginTracking(txHash, 4_294_967_296)).toThrow('LastLedgerSequence');
    expect(f.reader.beginTracking(txHash, 4_294_967_295).lastLedgerSequence).toBe(4_294_967_295);
  });
});
