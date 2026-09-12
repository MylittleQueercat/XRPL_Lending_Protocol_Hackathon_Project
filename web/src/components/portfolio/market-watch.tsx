"use client";

import * as React from "react";
import { Plus, RefreshCw } from "lucide-react";
import { Sparkline, useVaultHistory } from "@/components/charts";
import { Panel, PanelEmpty, Tick } from "@/components/terminal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPercent, formatShares, shortHash } from "@/lib/format";
import type { ShareHolding } from "@/lib/ledger";
import { cn } from "@/lib/utils";
import { isVaultId } from "@/components/position/known-vaults";
import { formatNav } from "./portfolio-math";
import type { VaultRow } from "./use-portfolio";

export const WATCH_HISTORY = { points: 24, spanLedgers: 6_000, pollMs: 15_000 } as const;

function WatchRow({ row, active, onSelect }: { row: VaultRow; active: boolean; onSelect: () => void }) {
  const history = useVaultHistory(row.vaultId, WATCH_HISTORY);
  const values = React.useMemo(() => history.samples.map((s) => s.navPerShare), [history.samples]);
  const position = row.position;
  const held = position ? BigInt(position.heldUnits || "0") : 0n;
  return (
    <li>
      <button
        type="button"
        role="option"
        aria-selected={active}
        data-active={active ? "true" : undefined}
        onClick={onSelect}
        title={row.vaultId}
        className={cn(
          "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0.5 border-b border-border px-3 py-2 text-left text-xs transition-colors hover:bg-secondary/60 focus-visible:bg-secondary/60 focus-visible:outline-none",
          active && "bg-accent hover:bg-accent",
        )}
      >
        <span className="flex items-center gap-1.5 font-mono text-[13px] font-medium">
          <span className={cn("inline-block size-1.5 rounded-full", held > 0n ? "bg-up" : "bg-muted-foreground/40")} aria-hidden />
          {shortHash(row.vaultId)}
        </span>
        <span className="justify-self-end font-mono text-[13px] font-semibold">
          {row.error ? <span className="tick-down">n/a</span> : position ? <Tick numeric={position.navPerShare}>{formatNav(position.navPerShare)}</Tick> : <Skeleton className="inline-block h-3.5 w-14 align-middle" />}
        </span>
        <span className="text-muted-foreground">
          {row.error ? <span className="tick-down">read failed</span> : position ? <>{held > 0n ? `${formatShares(position.heldUnits)} sh` : "no shares"} · {formatPercent(position.utilisation, 0)} out</> : "reading…"}
        </span>
        <span className="justify-self-end">
          <Sparkline values={values} width={72} height={20} />
        </span>
      </button>
    </li>
  );
}

function UnmappedRow({ holding }: { holding: ShareHolding }) {
  return (
    <li className="border-b border-border px-3 py-2 text-xs" title={holding.shareMptId}>
      <p className="flex items-center justify-between gap-2 font-mono text-[13px]">
        <span className="truncate">{shortHash(holding.shareMptId)}</span>
        <span className="tabular-nums">{formatShares(holding.amount)} units</span>
      </p>
      <p className="mt-0.5 text-muted-foreground">Unmapped issuance. Paste its vault id below to value it.</p>
    </li>
  );
}

// Left column: every vault this wallet knows, as quote rows. Blue dot = holds shares.
export function MarketWatch({ rows, unmapped, selectedId, loading, onSelect, onAdd, onRefresh }: {
  rows: VaultRow[];
  unmapped: ShareHolding[];
  selectedId: string | null;
  loading: boolean;
  onSelect: (vaultId: string) => void;
  onAdd: (vaultId: string) => void;
  onRefresh: () => void;
}) {
  const [draft, setDraft] = React.useState("");
  const valid = isVaultId(draft);
  return (
    <Panel
      title="Market watch"
      actions={<Button size="sm" variant="ghost" className="h-7 px-2" onClick={onRefresh} disabled={loading} aria-label="Re-read vaults from the ledger"><RefreshCw className={cn("size-3.5", loading && "animate-spin")} /></Button>}
      bodyClassName="flex flex-col"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 border-b border-border bg-terminal-head px-3 py-1 text-[10px] font-semibold uppercase tracking-[.08em] text-muted-foreground" aria-hidden>
        <span>Vault · held</span>
        <span className="text-right">NAV/sh · 6h</span>
      </div>
      {rows.length === 0 && unmapped.length === 0 ? (
        <PanelEmpty>No vault yet. Paste a vault id below; a deposit adds it here automatically.</PanelEmpty>
      ) : (
        <ul role="listbox" aria-label="Vaults" className="max-h-[22rem] overflow-y-auto lg:max-h-none">
          {rows.map((row) => <WatchRow key={row.vaultId} row={row} active={row.vaultId === selectedId} onSelect={() => onSelect(row.vaultId)} />)}
          {unmapped.map((h) => <UnmappedRow key={h.shareMptId} holding={h} />)}
        </ul>
      )}
      <form
        className="mt-auto space-y-1.5 border-t border-border p-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          onAdd(draft.trim().toUpperCase());
          setDraft("");
        }}
      >
        <label htmlFor="watch-vault-id" className="text-[10px] font-semibold uppercase tracking-[.08em] text-muted-foreground">Add vault by id</label>
        <div className="flex gap-1.5">
          <Input id="watch-vault-id" className="h-8 px-2 font-mono text-xs" placeholder="64-character ledger index" value={draft} onChange={(e) => setDraft(e.target.value)} aria-invalid={draft.length > 0 && !valid} autoComplete="off" spellCheck={false} />
          <Button type="submit" size="sm" variant="outline" className="h-8 px-2.5" disabled={!valid} aria-label="Add vault"><Plus className="size-3.5" /></Button>
        </div>
      </form>
    </Panel>
  );
}
