import type { MarketRuntime } from './market';

const MAX_BYTES=49152;
function json(value:unknown,status=200):Response {
  return Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
async function readBody(request:Request):Promise<unknown> {
  if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw new Error('JSON required.');
  if(Number(request.headers.get('content-length')??'0')>MAX_BYTES)throw new Error('Request too large.');
  const reader=request.body?.getReader();if(!reader)throw new Error('Missing body.');
  const chunks:Uint8Array[]=[];let length=0;
  try {
    while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>MAX_BYTES){await reader.cancel();throw new Error('Request too large.');}chunks.push(value);}
  }finally{reader.releaseLock();}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
/** No cookies, no arbitrary RPC proxy, no client-supplied network or server keys. */
export async function handleMarket(request:Request,runtime:MarketRuntime,challenge=false):Promise<Response> {
  // Next may construct request.url using its internal bind hostname. Validate the
  // actual Host against the configured public origin; never use forwarded headers.
  const host=request.headers.get('host');
  const validHost=host===null?new URL(request.url).origin===runtime.origin:host===new URL(runtime.origin).host;
  const origin=request.headers.get('origin');
  if(!validHost || (origin!==null && origin!==runtime.origin) || (request.method==='POST' && origin!==runtime.origin))return json({error:'Request origin is not allowed.'},403);
  if(request.method==='GET' && !challenge) {
    try{return json(runtime.service.snapshot());}catch{return json({error:'Shared marketplace storage is unavailable.'},503);}
  }
  if(request.method!=='POST')return json({error:'Method not allowed.'},405);
  let body:unknown;
  try{body=await readBody(request);}catch{return json({error:'Invalid JSON request or request too large.'},400);}
  if(challenge) {
    try {
      if(!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).sort().join(',')!=='account,action')return json({error:'Expected account and action.'},400);
      const value=body as {account:unknown;action:unknown};return json(runtime.auth.challenge(value.account,value.action));
    }catch{return json({error:'Invalid or excessive challenge request.'},400);}
  }
  let intent:ReturnType<MarketRuntime['auth']['consume']>;
  try{intent=runtime.auth.consume(body);}catch{return json({error:'Wallet intent is invalid, expired or already used. Refresh and authorize a new action.'},401);}
  try{return json(await runtime.service.execute(intent.account,intent.action));}
  catch(error){
    // Never log the request, signature, transaction blob, or a third-party error
    // message. Static codes and stack locations make server failures diagnosable.
    const knownMessages:Record<string,string>={
      'Event network unavailable or validated ledger is stale.':'NETWORK_NOT_READY',
      'This demo requires an enabled account master key on network 4001.':'MASTER_KEY_REQUIRED',
      'Offer not found.':'OFFER_NOT_FOUND',
      'Only the seller may publish this offer.':'SELLER_MISMATCH',
    };
    const failure=error instanceof Error?error:null;
    console.error('Raise marketplace action failed',{action:intent.action.type,code:failure?(knownMessages[failure.message]??'ACTION_FAILED'):'ACTION_FAILED',name:failure?.name??'UnknownError',locations:failure?.stack?.split('\n').slice(1,4)});
    return json({error:'Action could not complete. Refresh the shared market: terms may have changed or the event network may be unavailable. Never pay again while an attempt is pending.'},409);
  }
}

export async function dispatchMarket(request:Request,getRuntime:()=>MarketRuntime,challenge=false):Promise<Response> {
  try{return await handleMarket(request,getRuntime(),challenge);}
  catch{return json({error:'Shared marketplace service is unavailable.'},503);}
}
