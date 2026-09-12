import { getMarketRuntime } from '@/lib/server/market';
import { dispatchMarket } from '@/lib/server/market-http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export function POST(request:Request){return dispatchMarket(request,getMarketRuntime,true);}
