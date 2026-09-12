import { PageHeader } from "@/components/page-header";
import { MarketTable } from "@/components/market/market-table";

export const metadata = { title: "Market" };

export default function MarketPage() {
  return (
    <>
      <PageHeader
        title="Market"
        description="Vault-share positions offered by investors who want out before the vault can pay them. Prices are compared with the position's accounting value, read from the ledger — a discount is a price, not a yield."
      />
      <MarketTable />
    </>
  );
}
