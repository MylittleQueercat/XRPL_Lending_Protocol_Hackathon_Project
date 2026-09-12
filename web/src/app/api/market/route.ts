import { getMarketRuntime } from '@/lib/server/market';
import { dispatchMarket } from '@/lib/server/market-http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export function GET(request:Request){return dispatchMarket(request,getMarketRuntime);}
export function POST(request:Request){return dispatchMarket(request,getMarketRuntime);}
