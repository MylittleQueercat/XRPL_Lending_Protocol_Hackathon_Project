import { MarketWatch } from "@/components/market/market-watch";

export const metadata = { title: "Market" };

export default function MarketPage() {
  return (
    <>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-base font-semibold">Market</h1>
        <p className="text-xs text-muted-foreground">
          Shares in lending vaults, sold by investors who want their cash before the loans repay. Buy below value, cash out when the vault can pay.
        </p>
      </div>
      <MarketWatch />
    </>
  );
}
