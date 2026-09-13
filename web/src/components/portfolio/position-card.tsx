"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowDownToLine, ArrowUpFromLine, LineChart } from "lucide-react";
import { Sparkline, useVaultHistory } from "@/components/charts";
import { Delta, Tick } from "@/components/terminal";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPercent, formatShares, formatXrp, shortHash } from "@/lib/format";
import type { ShareHolding } from "@/lib/ledger";
import { routes } from "@/lib/network";
import { cn } from "@/lib/utils";
import { DeployedPanel } from "./deployed-panel";
import { DepositForm, WithdrawForm } from "./order-ticket";
import { formatNav, navChangeRatio, type Position } from "./portfolio-math";
import type { VaultRow } from "./use-portfolio";
import { VaultChart } from "./vault-chart";

export const WATCH_HISTORY = { points: 24, spanLedgers: 6_000, pollMs: 15_000 } as const;

function Figure({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-[10px] font-semibold uppercase tracking-[.1em] text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold tabular-nums">{children}</p>
    </div>
  );
}

// One vault the wallet holds or follows. The figures are on the card; deposit, withdraw and the
// full chart open in dialogs so the page stays light.
export function PositionCard({ row, account, txEpoch, afterTransaction }: { row: VaultRow; account: string; txEpoch: number; afterTransaction: () => Promise<void> }) {
  const history = useVaultHistory(row.vaultId, WATCH_HISTORY);
  const values = React.useMemo(() => history.samples.map((s) => s.navPerShare), [history.samples]);
  const [open, setOpen] = React.useState<"deposit" | "withdraw" | "details" | null>(null);
  const close = () => setOpen(null);
  const position: Position | null = row.position;
  const held = position ? BigInt(position.heldUnits || "0") : 0n;
  const canSell = !!position && held > 0n && position.vault.transferable;
  const shortId = shortHash(row.vaultId);

  return (
    <li className="terminal-panel p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("inline-block size-2 rounded-full", held > 0n ? "bg-up" : "bg-muted-foreground/40")} aria-hidden />
        <span className="font-mono text-sm font-semibold" title={row.vaultId}>Vault {shortId}</span>
        {position && (position.vault.transferable ? <Badge variant="outline" className="h-5 text-[10px]">transferable</Badge> : <Badge variant="warning" className="h-5 text-[10px]">non-transferable</Badge>)}
        {row.error && <span className="text-xs tick-down">read failed: {row.error}</span>}
        <span className="ml-auto hidden sm:block"><Sparkline values={values} width={110} height={26} /></span>
      </div>

      {position ? (
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-5">
          <Figure label="Shares">{formatShares(position.heldUnits)}</Figure>
          <Figure label="NAV / share"><Tick numeric={position.navPerShare}>{formatNav(position.navPerShare)}</Tick> <Delta ratio={navChangeRatio(history.first?.navPerShare, position.navPerShare)} decimals={2} className="ml-1 text-xs font-normal" /></Figure>
          <Figure label="Value"><Tick numeric={position.accountingValueDrops}>{formatXrp(position.accountingValueDrops, 2)}</Tick></Figure>
          <Figure label="Withdrawable today"><Tick numeric={position.withdrawableTodayDrops} className={BigInt(position.withdrawableTodayDrops) < BigInt(position.withdrawalValueEstimateDrops) ? "tick-down" : undefined}>{formatXrp(position.withdrawableTodayDrops, 2)}</Tick></Figure>
          <Figure label="On loan"><Tick numeric={position.utilisation}>{formatPercent(position.utilisation, 0)}</Tick></Figure>
        </div>
      ) : !row.error ? (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9" />)}</div>
      ) : null}

      {position && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setOpen("deposit")}><ArrowDownToLine /> Deposit</Button>
          <Button size="sm" variant="outline" disabled={held === 0n} onClick={() => setOpen("withdraw")}><ArrowUpFromLine /> Withdraw</Button>
          {canSell && <Link href={routes.sell({ vault: position.vault.vaultId, shares: position.heldUnits })} className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}>Sell</Link>}
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setOpen("details")}><LineChart /> Details</Button>
        </div>
      )}

      {position && (
        <>
          <Dialog open={open === "deposit"} onClose={close} title={`Deposit into vault ${shortId}`} description="Shares are issued at the vault's current NAV. The ledger's verdict is shown after signing." size="sm">
            <DepositForm key={txEpoch} position={position} afterTransaction={afterTransaction} />
          </Dialog>
          <Dialog open={open === "withdraw"} onClose={close} title={`Withdraw from vault ${shortId}`} description="The vault can only pay from cash it actually holds. If it cannot, you can sell the position instead." size="sm">
            <WithdrawForm key={txEpoch} position={position} account={account} afterTransaction={afterTransaction} />
          </Dialog>
          <Dialog open={open === "details"} onClose={close} title={`Vault ${shortId}`} description="Real vault history from the validated ledger, with the vault's own deposits, withdrawals, loans and repayments as markers." size="xl">
            <div className="space-y-3">
              <VaultChart position={position} vaultId={row.vaultId} txEpoch={txEpoch} onRefreshVault={() => void afterTransaction()} refreshing={false} />
              <DeployedPanel vault={position.vault} txEpoch={txEpoch} />
            </div>
          </Dialog>
        </>
      )}
    </li>
  );
}

export function UnmappedCard({ holding }: { holding: ShareHolding }) {
  return (
    <li className="terminal-panel p-4 text-sm">
      <p className="flex flex-wrap items-center justify-between gap-2 font-mono">
        <span className="truncate" title={holding.shareMptId}>Issuance {shortHash(holding.shareMptId)}</span>
        <span className="tabular-nums">{formatShares(holding.amount)} units</span>
      </p>
      <p className="mt-1 text-xs text-muted-foreground">Shares of a vault this browser does not know yet. Add the vault by id to value them; shares bought on the market are mapped automatically.</p>
    </li>
  );
}
