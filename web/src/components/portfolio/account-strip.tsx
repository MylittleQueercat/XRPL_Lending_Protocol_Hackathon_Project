"use client";

import * as React from "react";
import { Kpi, KpiStrip, Tick } from "@/components/terminal";
import { formatXrp } from "@/lib/format";
import type { NetworkStatus } from "@/lib/ledger";
import type { AccountTotals } from "./portfolio-math";

function useNow(intervalMs: number): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

// The account bar of the terminal. Every figure is a validated-ledger read; equity is the wallet
// balance plus the accounting value of the positions, which is an estimate, not a quote.
export function AccountStrip({ connected, balanceDrops, totals, positionCount, openOffers, network }: {
  connected: boolean;
  balanceDrops: string | null;
  totals: AccountTotals | null;
  positionCount: number;
  openOffers: number | null;
  network: NetworkStatus | null;
}) {
  const now = useNow(1000);
  const ledgerAge = network ? Math.max(0, Math.round(network.ledgerAgeSeconds + (now - Date.parse(network.checkedAt)) / 1000)) : null;
  const dash = <span className="text-muted-foreground">—</span>;
  const money = (drops: string | null | undefined) => (connected && drops !== null && drops !== undefined ? <Tick numeric={drops}>{formatXrp(drops, 2)}</Tick> : dash);
  return (
    <KpiStrip>
      <Kpi label="Balance" value={money(balanceDrops)} sub="wallet XRP" />
      <Kpi label="Positions" value={money(totals?.positionsValueDrops)} sub={connected ? `${positionCount} vault${positionCount === 1 ? "" : "s"} · accounting value` : "accounting value"} />
      <Kpi label="Equity" value={money(totals?.equityDrops)} sub="balance + positions" />
      <Kpi label="Withdrawable today" value={money(totals?.withdrawableTodayDrops)} sub="limited by vault cash" />
      <Kpi label="Open offers" value={connected && openOffers !== null ? <Tick numeric={openOffers}>{openOffers}</Tick> : dash} sub="on the shared market" />
      <Kpi
        label="Ledger"
        value={network ? <Tick numeric={network.ledgerIndex}>{network.ledgerIndex.toLocaleString("en-US")}</Tick> : dash}
        sub={network ? <span className={ledgerAge !== null && ledgerAge > 30 ? "tick-down" : undefined}>validated {ledgerAge}s ago · net {network.networkId}</span> : "waiting for node"}
      />
    </KpiStrip>
  );
}
