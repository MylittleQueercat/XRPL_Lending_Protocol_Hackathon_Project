"use client";

import * as React from "react";
import { Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useWallet } from "@/lib/wallet";
import { useOffers } from "@/components/market/use-offers";
import { AccountStrip } from "./account-strip";
import { DeployedPanel } from "./deployed-panel";
import { MarketWatch } from "./market-watch";
import { NotConnected } from "./not-connected";
import { OrderTicket } from "./order-ticket";
import { accountTotals } from "./portfolio-math";
import { Toolbox } from "./toolbox";
import { usePortfolio } from "./use-portfolio";
import { VaultChart } from "./vault-chart";

// Portfolio mode: account strip, market watch, chart, order ticket, toolbox. One data hook feeds
// the strip, the watch, the ticket and the positions table so every figure shares one ledger read.
export function PortfolioTerminal() {
  const wallet = useWallet();
  const account = wallet.account?.address ?? null;
  const portfolio = usePortfolio(account);
  const market = useOffers();
  const openOffers = market.ready && account ? market.offers.filter((o) => o.seller === account && o.state === "open").length : null;
  // Bumped after every transaction the ticket submits so history, chart markers and loans re-read.
  const [txEpoch, setTxEpoch] = React.useState(0);
  const { refresh } = portfolio;
  const afterTransaction = React.useCallback(async () => {
    await refresh();
    setTxEpoch((n) => n + 1);
  }, [refresh]);

  const totals = React.useMemo(() => (account ? accountTotals(portfolio.positions, wallet.balanceDrops) : null), [account, portfolio.positions, wallet.balanceDrops]);
  const selectedPosition = portfolio.selected?.position ?? null;

  return (
    <div className="space-y-3">
      <AccountStrip connected={!!account} balanceDrops={wallet.balanceDrops} totals={totals} positionCount={portfolio.positions.length} openOffers={openOffers} network={wallet.network} />
      {!account ? (
        <NotConnected />
      ) : (
        <>
          {portfolio.error && (
            <Alert variant="destructive">
              <Info />
              <AlertTitle>Could not read the ledger</AlertTitle>
              <AlertDescription>{portfolio.error}</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-3 lg:grid-cols-[18rem_minmax(0,1fr)_20rem] lg:items-stretch">
            <MarketWatch rows={portfolio.rows} unmapped={portfolio.unmapped} selectedId={portfolio.selectedId} loading={portfolio.loading} onSelect={portfolio.select} onAdd={portfolio.addVault} onRefresh={() => void portfolio.refresh()} />
            <div className="flex min-w-0 flex-col gap-3">
              <VaultChart position={selectedPosition} vaultId={portfolio.selectedId} txEpoch={txEpoch} onRefreshVault={() => void portfolio.refresh()} refreshing={portfolio.loading} />
              <DeployedPanel vault={selectedPosition?.vault ?? null} txEpoch={txEpoch} />
            </div>
            <OrderTicket position={selectedPosition} account={account} vaultError={portfolio.selected?.error ?? null} afterTransaction={afterTransaction} />
          </div>
          <Toolbox positions={portfolio.positions} selectedId={portfolio.selectedId} loading={portfolio.loading && !portfolio.loadedOnce} openOffers={openOffers} account={account} txEpoch={txEpoch} onSelect={portfolio.select} />
          <p className="px-1 text-[11px] text-muted-foreground">
            Every figure is read from the validated ledger of the Track 1 network and re-read every 15 s and after each transaction. Accounting value follows V1.1 cash-basis accounting: realised interest only, unrealized losses deducted. Blue is up, long, profit or discount; red is down, loss or premium.
          </p>
        </>
      )}
    </div>
  );
}
