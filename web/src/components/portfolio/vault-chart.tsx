"use client";

import * as React from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { TimeSeriesChart, chartColor, dropsToXrpNumber, formatXrpAxis, useVaultHistory, type Marker } from "@/components/charts";
import { Delta, Panel, PanelEmpty, PanelTabs, Tick } from "@/components/terminal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { readAccountActivity, type ActivityItem } from "@/lib/history";
import { formatPercent, formatShares, formatXrp, shortAddress, shortHash } from "@/lib/format";
import { explorerAccount } from "@/lib/network";
import { cn } from "@/lib/utils";
import { formatNav, navChangeRatio, type Position } from "./portfolio-math";

type ChartTab = "nav" | "assets" | "utilisation";
type Range = "1h" | "6h" | "24h" | "all";

// This ledger closes roughly every 3.5 s.
const RANGES: ReadonlyArray<{ id: Range; spanLedgers: number }> = [
  { id: "1h", spanLedgers: 1_000 },
  { id: "6h", spanLedgers: 6_000 },
  { id: "24h", spanLedgers: 25_000 },
  { id: "all", spanLedgers: 80_000 },
];
const DEFAULT_RANGE: Range = "6h";
const POINTS = 48;

const MARKER_STYLE: Record<string, { label: string; color: string }> = {
  VaultDeposit: { label: "deposit", color: chartColor.up },
  VaultWithdraw: { label: "withdraw", color: chartColor.down },
  LoanSet: { label: "loan out", color: chartColor.c4 },
  LoanPay: { label: "repaid", color: chartColor.c3 },
};

const TABS: ReadonlyArray<{ id: ChartTab; label: string }> = [
  { id: "nav", label: "NAV per share" },
  { id: "assets", label: "Assets & cash" },
  { id: "utilisation", label: "Utilisation" },
];

function xrpLabel(v: number) {
  return `${v.toLocaleString("en-US", { maximumFractionDigits: 6 })} XRP`;
}

function Figure({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0 px-3 py-1.5", className)}>
      <p className="truncate text-[10px] font-semibold uppercase tracking-[.08em] text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-semibold tabular-nums">{children}</p>
    </div>
  );
}

// Centre panel: the selected vault's real past state from the ledger, with its own deposits,
// withdrawals, disbursements and repayments marked on the time axis.
export function VaultChart({ position, vaultId, txEpoch, onRefreshVault, refreshing }: {
  position: Position | null;
  vaultId: string | null;
  txEpoch: number;
  onRefreshVault: () => void;
  refreshing: boolean;
}) {
  const [tab, setTab] = React.useState<ChartTab>("nav");
  const [range, setRange] = React.useState<Range>(DEFAULT_RANGE);
  const spanLedgers = RANGES.find((r) => r.id === range)!.spanLedgers;
  const history = useVaultHistory(vaultId, { points: POINTS, spanLedgers, pollMs: 15_000 });
  const { refresh: refreshHistory } = history;

  // The history cache is per vault, not per range: a range other than the default has to be
  // fetched explicitly, and again after every transaction so the last point is current.
  React.useEffect(() => {
    if (range !== DEFAULT_RANGE || txEpoch > 0) void refreshHistory();
  }, [refreshHistory, range, txEpoch]);

  const [activity, setActivity] = React.useState<ActivityItem[]>([]);
  const pseudoAccount = position?.vault.pseudoAccount ?? null;
  React.useEffect(() => {
    if (!pseudoAccount) { setActivity([]); return; }
    let cancelled = false;
    readAccountActivity(pseudoAccount, 40).then((items) => { if (!cancelled) setActivity(items); }).catch(() => { if (!cancelled) setActivity([]); });
    return () => { cancelled = true; };
  }, [pseudoAccount, txEpoch]);

  const samples = history.samples;
  const data = React.useMemo(() => samples.map((s) => ({
    time: s.time,
    nav: s.sharesOutstanding === "0" ? null : s.navPerShare,
    total: dropsToXrpNumber(s.assetsTotalDrops.split(".")[0] || "0"),
    available: dropsToXrpNumber(s.assetsAvailableDrops.split(".")[0] || "0"),
    utilisation: s.utilisation * 100,
  })), [samples]);

  const markers = React.useMemo<Marker[]>(() => {
    if (data.length < 2) return [];
    const from = data[0].time;
    const to = data[data.length - 1].time;
    return activity
      .filter((a) => a.resultCode === "tesSUCCESS" && MARKER_STYLE[a.kind] && a.time >= from && a.time <= to)
      .map((a) => ({ x: a.time, label: MARKER_STYLE[a.kind].label, color: MARKER_STYLE[a.kind].color }));
  }, [activity, data]);

  const navNow = position?.navPerShare ?? history.latest?.navPerShare ?? null;
  const navDelta = navChangeRatio(history.first?.navPerShare, navNow);
  const vault = position?.vault ?? null;

  const chart = (() => {
    if (!vaultId) return <PanelEmpty className="min-h-[220px]">Select a vault in Market watch to chart it.</PanelEmpty>;
    if (history.status === "error" && samples.length === 0) {
      return (
        <PanelEmpty className="min-h-[220px]">
          <span>
            Could not read the vault&apos;s history: {history.error}
            <br />
            <Button size="sm" variant="outline" className="mt-2" onClick={() => void refreshHistory()}>Try again</Button>
          </span>
        </PanelEmpty>
      );
    }
    if (history.status === "loading" && samples.length === 0) return <Skeleton className="m-3 h-[220px]" />;
    if (samples.length === 0 && history.status === "ready") return <PanelEmpty className="min-h-[220px]">The vault did not exist in this range. Try a shorter range or wait for the next ledger.</PanelEmpty>;
    if (tab === "nav") {
      return <TimeSeriesChart data={data} series={[{ key: "nav", label: "NAV / share", format: (v) => `${v.toFixed(6)} drops` }]} yFormat={(v) => v.toFixed(4)} markers={markers} directional height={220} className="px-1 pt-2" />;
    }
    if (tab === "assets") {
      return <TimeSeriesChart data={data} series={[{ key: "total", label: "Assets total", color: chartColor.c1, area: true, format: xrpLabel }, { key: "available", label: "Cash available", color: chartColor.c3, area: true, format: xrpLabel }]} yFormat={formatXrpAxis} markers={markers} height={220} className="px-1 pt-2" />;
    }
    return <TimeSeriesChart data={data} series={[{ key: "utilisation", label: "Utilisation", color: chartColor.c4, area: true, format: (v) => `${v.toFixed(1)} %` }]} yFormat={(v) => `${v.toFixed(0)} %`} markers={markers} height={220} className="px-1 pt-2" />;
  })();

  return (
    <Panel
      title={vault ? <span className="flex items-center gap-2">Vault <span className="font-mono normal-case tracking-normal text-foreground" title={vault.vaultId}>{shortHash(vault.vaultId)}</span>{vault.transferable ? <Badge variant="outline" className="h-5 px-1.5 text-[10px] normal-case tracking-normal">transferable</Badge> : <Badge variant="warning" className="h-5 px-1.5 text-[10px] normal-case tracking-normal">non-transferable</Badge>}</span> : "Chart"}
      actions={
        <span role="group" aria-label="Chart range" className="flex items-center gap-0.5">
          {RANGES.map((r) => (
            <button key={r.id} type="button" aria-pressed={range === r.id} onClick={() => setRange(r.id)} className={cn("h-6 rounded px-1.5 text-[11px] font-medium tabular-nums transition-colors", range === r.id ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground")}>
              {r.id}
            </button>
          ))}
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => { onRefreshVault(); void refreshHistory(); }} disabled={refreshing || history.status === "loading"} aria-label="Refresh chart and vault from the ledger">
            <RefreshCw className={cn("size-3.5", (refreshing || history.status === "loading") && "animate-spin")} />
          </Button>
        </span>
      }
      bodyClassName="flex flex-col"
    >
      <PanelTabs tabs={TABS} value={tab} onChange={setTab} ariaLabel="Chart series" />
      <div className="relative">
        {chart}
        {markers.length > 0 && (
          <p className="px-3 pb-1 text-[10px] text-muted-foreground">
            Markers: vault activity from the ledger —
            {Object.entries(MARKER_STYLE).map(([kind, m]) => <span key={kind} className="ml-2 inline-flex items-center gap-1"><span className="inline-block h-px w-3 border-t border-dashed" style={{ borderColor: m.color }} aria-hidden />{m.label}</span>)}
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 divide-x divide-y divide-border border-t border-border sm:grid-cols-3 lg:grid-cols-6 lg:divide-y-0">
        <Figure label="NAV / share">{navNow !== null ? <Tick numeric={navNow}>{formatNav(navNow)}</Tick> : "—"}</Figure>
        <Figure label={`Δ ${range}`}><Delta ratio={navDelta} decimals={3} /></Figure>
        <Figure label="Assets total">{vault ? <Tick numeric={vault.assetsTotalDrops.split(".")[0]}>{formatXrp(vault.assetsTotalDrops, 2)}</Tick> : "—"}</Figure>
        <Figure label="Cash available">{vault ? <Tick numeric={vault.assetsAvailableDrops.split(".")[0]}>{formatXrp(vault.assetsAvailableDrops, 2)}</Tick> : "—"}</Figure>
        <Figure label="Utilisation">{position ? <Tick numeric={position.utilisation}>{formatPercent(position.utilisation)}</Tick> : "—"}</Figure>
        <Figure label="Shares out">{vault ? <Tick numeric={vault.sharesOutstanding}>{formatShares(vault.sharesOutstanding)}</Tick> : "—"}</Figure>
      </div>
      {vault && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
          <span title={vault.shareMptId}>shares {shortHash(vault.shareMptId)}</span>
          <a href={explorerAccount(vault.owner)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">owner {shortAddress(vault.owner)} <ExternalLink className="size-3" /></a>
          <a href={explorerAccount(vault.pseudoAccount)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">vault account {shortAddress(vault.pseudoAccount)} <ExternalLink className="size-3" /></a>
          <span className="ml-auto">read at ledger {vault.ledgerIndex.toLocaleString("en-US")}{history.first ? ` · history from ${history.first.ledgerIndex.toLocaleString("en-US")}` : ""}</span>
        </p>
      )}
    </Panel>
  );
}
