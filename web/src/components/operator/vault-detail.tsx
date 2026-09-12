"use client";

import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Panel, PanelEmpty, SignedXrp, Tick } from "@/components/terminal";
import { DonutChart, TimeSeriesChart, chartColor, dropsToXrpNumber, formatXrpAxis, useVaultHistory, type Marker } from "@/components/charts";
import { readAccountActivity, utilisationOf, type ActivityItem } from "@/lib/history";
import { wholeDrops, type VaultState } from "@/lib/ledger";
import { formatShares, formatXrp, shortAddress } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AddressLink, Figure, Mono, Note, TxLink, xrp } from "./shared";

type RangeId = "1h" | "6h" | "24h" | "all";
// ≈3.5 s per ledger on the Track 1 network.
const RANGES: ReadonlyArray<{ id: RangeId; spanLedgers: number }> = [
  { id: "1h", spanLedgers: 1_000 },
  { id: "6h", spanLedgers: 6_000 },
  { id: "24h", spanLedgers: 25_000 },
  { id: "all", spanLedgers: 80_000 },
];

const MARKER_KINDS: Record<string, string> = { VaultDeposit: "Deposit", VaultWithdraw: "Withdraw", LoanSet: "Disburse", LoanPay: "Repay" };
const ACTIVITY_LABEL: Record<string, string> = { ...MARKER_KINDS, VaultCreate: "Create", LoanBrokerSet: "Broker", LoanBrokerCoverDeposit: "Cover", Batch: "Sale batch", Payment: "Payment", MPTokenAuthorize: "Authorize" };

const fmtXrp = (v: number) => `${v.toLocaleString("en-US", { maximumFractionDigits: 6 })} XRP`;

// The vault's real past state from the ledger, its cash vs deployed split, and its activity feed.
export function VaultDetail({ vault, tick, compact }: { vault: VaultState; tick: number; compact?: boolean }) {
  const [range, setRange] = React.useState<RangeId>("6h");
  const spanLedgers = RANGES.find((r) => r.id === range)?.spanLedgers ?? 6_000;
  const history = useVaultHistory(vault.vaultId, { points: 48, spanLedgers, pollMs: 15_000 });
  const { refresh } = history;
  const lastRange = React.useRef(range);
  React.useEffect(() => {
    if (lastRange.current === range) return;
    lastRange.current = range;
    void refresh();
  }, [range, refresh]);

  const [activity, setActivity] = React.useState<ActivityItem[] | null>(null);
  const [activityError, setActivityError] = React.useState<string | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    readAccountActivity(vault.pseudoAccount, 40)
      .then((items) => { if (!cancelled) { setActivity(items); setActivityError(null); } })
      .catch((error: Error) => { if (!cancelled) setActivityError(error.message); });
    return () => { cancelled = true; };
  }, [vault.pseudoAccount, tick]);

  const data = React.useMemo(() => history.samples.map((s) => ({ time: s.time, assets: dropsToXrpNumber(s.assetsTotalDrops), cash: dropsToXrpNumber(s.assetsAvailableDrops) })), [history.samples]);
  const markers = React.useMemo<Marker[]>(() => {
    if (!activity || data.length < 2) return [];
    const from = data[0].time; const to = data[data.length - 1].time;
    return activity
      .filter((a) => MARKER_KINDS[a.kind] && a.resultCode === "tesSUCCESS" && a.time >= from && a.time <= to)
      .map((a) => ({ x: a.time, label: MARKER_KINDS[a.kind], color: BigInt(a.xrpDeltaDrops || "0") < 0n ? chartColor.down : chartColor.up }));
  }, [activity, data]);

  const utilisation = utilisationOf(vault.assetsTotalDrops, vault.assetsAvailableDrops);
  const deployedDrops = (BigInt(wholeDrops(vault.assetsTotalDrops)) - BigInt(wholeDrops(vault.assetsAvailableDrops))).toString();
  const cashNumber = dropsToXrpNumber(vault.assetsAvailableDrops);
  const deployedNumber = dropsToXrpNumber(deployedDrops);
  const firstAssets = data[0]?.assets; const lastAssets = data[data.length - 1]?.assets;
  const change = typeof firstAssets === "number" && typeof lastAssets === "number" && firstAssets > 0 ? (lastAssets - firstAssets) / firstAssets : null;

  return (
    <>
      <Panel
        title={<span>Vault <Mono value={vault.vaultId} short={12} className="normal-case tracking-normal" /></span>}
        actions={
          <div role="radiogroup" aria-label="Chart range" className="flex items-center gap-0.5">
            {RANGES.map((r) => (
              <button key={r.id} type="button" role="radio" aria-checked={range === r.id} onClick={() => setRange(r.id)} className={cn("h-6 rounded px-2 text-[11px] font-medium tabular-nums transition-colors", range === r.id ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground")}>{r.id}</button>
            ))}
            <span className="ml-2 text-[10px] text-muted-foreground">{history.status === "loading" ? "sampling ledger…" : history.status === "error" ? "history unavailable" : `${history.samples.length} sample${history.samples.length === 1 ? "" : "s"}`}</span>
          </div>
        }
      >
        <div className={cn("grid gap-3 p-3", compact ? "" : "md:grid-cols-[minmax(0,1fr)_13rem]")}>
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="text-lg font-semibold tabular-nums"><Tick numeric={vault.assetsTotalDrops}>{formatXrp(vault.assetsTotalDrops)}</Tick></span>
              <span className="text-xs text-muted-foreground">assets total{change !== null && <> · <span className={cn("tabular-nums", change > 0 ? "text-up" : change < 0 ? "text-down" : "")}>{change > 0 ? "+" : change < 0 ? "−" : ""}{(Math.abs(change) * 100).toFixed(2)} % over range</span></>}</span>
              <span className="ml-auto flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-3 bg-[var(--chart-1)]" /> assets</span>
                <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-3 border-t border-dashed border-[var(--chart-3)]" /> cash</span>
              </span>
            </div>
            {history.status === "loading" && data.length < 2 ? (
              <Skeleton className="h-[200px]" />
            ) : (
              <TimeSeriesChart
                data={data}
                height={compact ? 150 : 200}
                series={[
                  { key: "assets", label: "Assets total", color: chartColor.c1, area: true, format: fmtXrp },
                  { key: "cash", label: "Cash available", color: chartColor.c3, dashed: true, format: fmtXrp },
                ]}
                yFormat={formatXrpAxis}
                markers={markers}
                emptyLabel={history.status === "error" ? `History unavailable: ${history.error}` : history.samples.length === 1 ? "The vault is younger than this range. A live sample is added every 15 s; try 1h." : "Not enough history in this range yet"}
              />
            )}
            <Note className="mt-1">Sampled from the vault entry at past validated ledgers. Markers: <span className="text-up">blue</span> inflow (deposit, repayment), <span className="text-down">red</span> outflow (withdrawal, disbursement).</Note>
          </div>
          {!compact && (
            <div className="flex flex-col items-center gap-2 border-t border-border pt-3 md:border-l md:border-t-0 md:pl-3 md:pt-0">
              <DonutChart
                size={148}
                slices={[{ name: "Cash", value: cashNumber, color: chartColor.c3 }, { name: "Deployed", value: deployedNumber, color: chartColor.c1 }]}
                centerLabel="utilised"
                centerValue={`${(utilisation * 100).toFixed(1)} %`}
                format={fmtXrp}
              />
              <div className="grid w-full grid-cols-2 gap-x-3 gap-y-2">
                <Figure label="Cash" value={<Tick numeric={vault.assetsAvailableDrops}>{xrp(vault.assetsAvailableDrops, 2)}</Tick>} />
                <Figure label="Deployed" value={<Tick numeric={deployedDrops}>{xrp(deployedDrops, 2)}</Tick>} />
                <Figure label="Shares" value={formatShares(vault.sharesOutstanding)} sub={vault.transferable ? "transferable" : "non-transferable"} />
                <Figure label="Pseudo-account" value={<AddressLink address={vault.pseudoAccount} />} sub={<span title={vault.shareMptId}>issuance {vault.shareMptId.slice(0, 8)}…</span>} />
              </div>
            </div>
          )}
        </div>
      </Panel>

      {!compact && (
        <Panel title={<span>Vault activity <span className="normal-case tracking-normal text-muted-foreground">· {shortAddress(vault.pseudoAccount)}</span></span>} bodyClassName="max-h-64 overflow-auto">
          {activity === null && !activityError ? (
            <div className="space-y-2 p-3"><Skeleton className="h-5" /><Skeleton className="h-5" /><Skeleton className="h-5" /></div>
          ) : activityError ? (
            <PanelEmpty>Could not read the vault&apos;s transactions: {activityError}</PanelEmpty>
          ) : activity && activity.length === 0 ? (
            <PanelEmpty>No transaction has touched this vault yet.</PanelEmpty>
          ) : (
            <Table className="terminal-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead><TableHead>Type</TableHead><TableHead>Initiator</TableHead><TableHead className="text-right">Vault cash</TableHead><TableHead>Result</TableHead><TableHead>Hash</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activity?.map((a) => (
                  <TableRow key={a.hash}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground" title={a.time ? new Date(a.time).toLocaleString("en-GB") : undefined}>{a.time ? new Date(a.time).toLocaleTimeString("en-GB") : `ledger ${a.ledgerIndex}`}</TableCell>
                    <TableCell className="text-xs font-medium">{ACTIVITY_LABEL[a.kind] ?? a.type}</TableCell>
                    <TableCell>{a.initiator ? <AddressLink address={a.initiator} /> : "—"}</TableCell>
                    <TableCell className="text-right"><SignedXrp drops={a.xrpDeltaDrops} zeroLabel="0" /></TableCell>
                    <TableCell className="whitespace-nowrap"><code className={cn("font-mono text-[11px]", a.resultCode === "tesSUCCESS" ? "text-muted-foreground" : "text-down")}>{a.resultCode}</code></TableCell>
                    <TableCell className="whitespace-nowrap"><TxLink hash={a.hash} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Panel>
      )}
    </>
  );
}
