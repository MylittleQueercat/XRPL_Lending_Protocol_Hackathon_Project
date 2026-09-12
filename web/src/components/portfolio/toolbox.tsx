"use client";

import * as React from "react";
import Link from "next/link";
import { ExternalLink, Plus, RefreshCw } from "lucide-react";
import { formatTimeFull, useVaultHistory } from "@/components/charts";
import { Delta, Panel, PanelEmpty, PanelTabs, SignedXrp, Tick } from "@/components/terminal";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MyOffersTable } from "@/components/sell/my-offers";
import { readAccountActivity, type ActivityItem } from "@/lib/history";
import { formatPercent, formatShares, formatXrp, shortHash } from "@/lib/format";
import { explorerTx, routes } from "@/lib/network";
import { cn } from "@/lib/utils";
import { WATCH_HISTORY } from "./market-watch";
import { formatNav, navChangeRatio, type Position } from "./portfolio-math";

type Tab = "positions" | "orders" | "history";

function PositionRow({ position, active, onSelect }: { position: Position; active: boolean; onSelect: () => void }) {
  // Cached by the market-watch row; no polling here, the live NAV comes from the position itself.
  const history = useVaultHistory(position.vault.vaultId, { ...WATCH_HISTORY, pollMs: 0 });
  const { vault } = position;
  return (
    <TableRow data-active={active ? "true" : undefined}>
      <TableCell className="font-mono" title={vault.vaultId}>{shortHash(vault.vaultId)}</TableCell>
      <TableCell className="text-right">{formatShares(position.heldUnits)}</TableCell>
      <TableCell className="text-right font-mono"><Tick numeric={position.navPerShare}>{formatNav(position.navPerShare)}</Tick></TableCell>
      <TableCell className="text-right"><Tick numeric={position.accountingValueDrops}>{formatXrp(position.accountingValueDrops)}</Tick></TableCell>
      <TableCell className="text-right"><Tick numeric={position.withdrawableTodayDrops} className={BigInt(position.withdrawableTodayDrops) < BigInt(position.withdrawalValueEstimateDrops) ? "tick-down" : undefined}>{formatXrp(position.withdrawableTodayDrops)}</Tick></TableCell>
      <TableCell className="text-right"><Tick numeric={position.utilisation}>{formatPercent(position.utilisation)}</Tick></TableCell>
      <TableCell className="text-right"><Delta ratio={navChangeRatio(history.first?.navPerShare, position.navPerShare)} decimals={3} /></TableCell>
      <TableCell>{vault.transferable ? <Badge variant="outline" className="h-5 text-[10px]">transferable</Badge> : <Badge variant="warning" className="h-5 text-[10px]">non-transferable</Badge>}</TableCell>
      <TableCell className="text-right">
        <span className="inline-flex items-center gap-1">
          <Button size="sm" variant={active ? "secondary" : "ghost"} className="h-7 px-2 text-xs" onClick={onSelect} aria-pressed={active}>{active ? "Selected" : "Select"}</Button>
          {vault.transferable && <Link href={routes.sell({ vault: vault.vaultId, shares: position.heldUnits })} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-7 px-2 text-xs")}>Sell</Link>}
        </span>
      </TableCell>
    </TableRow>
  );
}

function PositionsTab({ positions, selectedId, loading, onSelect }: { positions: Position[]; selectedId: string | null; loading: boolean; onSelect: (vaultId: string) => void }) {
  if (positions.length === 0) {
    return loading ? <Skeleton className="m-3 h-16" /> : <PanelEmpty>No vault shares on this wallet. Deposit into a vault from the order ticket, or buy a position on the market.</PanelEmpty>;
  }
  return (
    <Table className="terminal-table">
      <TableHeader>
        <TableRow>
          <TableHead>Vault</TableHead>
          <TableHead className="text-right">Shares</TableHead>
          <TableHead className="text-right">NAV / sh</TableHead>
          <TableHead className="text-right">Value</TableHead>
          <TableHead className="text-right">Withdrawable today</TableHead>
          <TableHead className="text-right">Utilisation</TableHead>
          <TableHead className="text-right">Δ NAV 6h</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {positions.map((p) => <PositionRow key={p.vault.vaultId} position={p} active={p.vault.vaultId === selectedId} onSelect={() => onSelect(p.vault.vaultId)} />)}
      </TableBody>
    </Table>
  );
}

function HistoryTab({ account, txEpoch }: { account: string; txEpoch: number }) {
  const [items, setItems] = React.useState<ActivityItem[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setItems(await readAccountActivity(account, 40)); }
    catch (cause) { setError((cause as Error).message); }
    finally { setLoading(false); }
  }, [account]);
  React.useEffect(() => { void load(); }, [load, txEpoch]);

  return (
    <div>
      <div className="flex items-center justify-between border-b border-border px-3 py-1 text-[11px] text-muted-foreground">
        <span>Last {items?.length ?? 40} transactions of this wallet, newest first. XRP change includes fees.</span>
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => void load()} disabled={loading} aria-label="Refresh history"><RefreshCw className={cn("size-3.5", loading && "animate-spin")} /></Button>
      </div>
      {error && <PanelEmpty className="text-destructive">{error}</PanelEmpty>}
      {!error && items === null && <Skeleton className="m-3 h-16" />}
      {!error && items && items.length === 0 && <PanelEmpty>No transactions yet on this account.</PanelEmpty>}
      {!error && items && items.length > 0 && (
        <Table className="terminal-table">
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Object</TableHead>
              <TableHead className="text-right">XRP change</TableHead>
              <TableHead>Result</TableHead>
              <TableHead className="text-right">Ledger</TableHead>
              <TableHead className="text-right">Hash</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((a) => {
              const ok = a.resultCode === "tesSUCCESS";
              const object = a.vaultId ? { label: "vault", id: a.vaultId } : a.loanId ? { label: "loan", id: a.loanId } : a.loanBrokerId ? { label: "broker", id: a.loanBrokerId } : null;
              return (
                <TableRow key={a.hash}>
                  <TableCell className="text-muted-foreground">{a.time ? formatTimeFull(a.time) : "—"}</TableCell>
                  <TableCell className="font-medium">{a.type}{a.initiator && a.initiator !== account && <span className="ml-1 text-[10px] text-muted-foreground">(by other)</span>}</TableCell>
                  <TableCell className="font-mono text-muted-foreground" title={object?.id}>{object ? <>{object.label} {shortHash(object.id)}</> : "—"}</TableCell>
                  <TableCell className="text-right"><SignedXrp drops={a.xrpDeltaDrops} /></TableCell>
                  <TableCell><span className={cn("font-mono text-xs", ok ? "tick-up" : "tick-down")}>{a.resultCode}</span></TableCell>
                  <TableCell className="text-right text-muted-foreground">{a.ledgerIndex.toLocaleString("en-US")}</TableCell>
                  <TableCell className="text-right"><a href={explorerTx(a.hash)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-primary hover:underline">{shortHash(a.hash)} <ExternalLink className="size-3" /></a></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

// Bottom toolbox: what you hold, what you have listed, what you have done.
export function Toolbox({ positions, selectedId, loading, openOffers, account, txEpoch, onSelect }: {
  positions: Position[];
  selectedId: string | null;
  loading: boolean;
  openOffers: number | null;
  account: string;
  txEpoch: number;
  onSelect: (vaultId: string) => void;
}) {
  const [tab, setTab] = React.useState<Tab>("positions");
  return (
    <Panel
      title="Toolbox"
      actions={tab === "orders" ? <Link href={routes.sell(selectedId ? { vault: selectedId } : undefined)} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-7 px-2 text-xs")}><Plus className="size-3.5" /> New offer</Link> : undefined}
    >
      <PanelTabs
        tabs={[
          { id: "positions", label: "Positions", count: positions.length },
          { id: "orders", label: "Orders", ...(openOffers !== null ? { count: openOffers } : {}) },
          { id: "history", label: "History" },
        ]}
        value={tab}
        onChange={setTab}
        ariaLabel="Toolbox"
      />
      <div role="tabpanel">
        {tab === "positions" && <PositionsTab positions={positions} selectedId={selectedId} loading={loading} onSelect={onSelect} />}
        {tab === "orders" && <MyOffersTable />}
        {tab === "history" && <HistoryTab account={account} txEpoch={txEpoch} />}
      </div>
    </Panel>
  );
}
