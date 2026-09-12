import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { MarketAuth } from '../../../../src/market-auth.js';
import { MarketService } from '../../../../src/market-service.js';
import { MarketStore } from '../../../../src/market-store.js';
import { SqliteOfferStore } from '../../../../src/offer-store.js';
import { XrplMarketGateway } from '../../../../src/market-ledger.js';

export interface MarketRuntime { origin:string; auth:MarketAuth; service:MarketService }
const globalMarket = globalThis as typeof globalThis & {raiseMarketRuntime?:MarketRuntime};
export function getMarketRuntime():MarketRuntime {
  if(globalMarket.raiseMarketRuntime)return globalMarket.raiseMarketRuntime;
  const origin=process.env.RAISE_MARKET_ORIGIN??'http://localhost:3000';
  const parsed=new URL(origin);
  if(parsed.origin!==origin || !['http:','https:'].includes(parsed.protocol))throw new Error('Invalid market origin configuration.');
  const path=resolve(process.env.RAISE_MARKET_DB_PATH??resolve(process.cwd(),'.local','market.sqlite'));
  mkdirSync(dirname(path),{recursive:true,mode:0o700});
  const store=new MarketStore(path),offers=new SqliteOfferStore(path),gateway=new XrplMarketGateway();
  const runtime={origin,auth:new MarketAuth(store,origin),service:new MarketService(store,offers,gateway)};
  globalMarket.raiseMarketRuntime=runtime;return runtime;
}
