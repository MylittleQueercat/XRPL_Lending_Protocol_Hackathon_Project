"use client";

import * as React from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { formatTimeFull } from "@/components/charts";
import { PanelEmpty, SignedXrp } from "@/components/terminal";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { readAccountActivity, type ActivityItem } from "@/lib/history";
import { shortHash } from "@/lib/format";
import { explorerTx } from "@/lib/network";
import { cn } from "@/lib/utils";

// The wallet's last transactions from account_tx, with the signed XRP change of each.
export function HistoryTable({ account, txEpoch }: { account: string; txEpoch: number }) {
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

