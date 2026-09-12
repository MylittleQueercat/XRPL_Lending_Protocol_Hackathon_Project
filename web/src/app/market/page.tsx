import { MarketWatch } from "@/components/market/market-watch";

export const metadata = { title: "Market" };

export default function MarketPage() {
  return (
    <>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-base font-semibold">Market</h1>
        <p className="text-xs text-muted-foreground">
          Vault-share positions offered by investors who want out before the vault can pay them. Prices are compared with the position&apos;s accounting value, read from the ledger. A discount is a price, not a yield.
        </p>
      </div>
      <MarketWatch />
    </>
  );
}
