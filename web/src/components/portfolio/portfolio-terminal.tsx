"use client";

import * as React from "react";
import Link from "next/link";
import { History, Info, ListOrdered, Plus, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Kpi, KpiStrip, PanelEmpty, Tick } from "@/components/terminal";
import { MyOffersTable } from "@/components/sell/my-offers";
import { useOffers } from "@/components/market/use-offers";
import { isVaultId } from "@/components/position/known-vaults";
import { useWallet } from "@/lib/wallet";
import { formatXrp } from "@/lib/format";
import { routes } from "@/lib/network";
import { cn } from "@/lib/utils";
import { HistoryTable } from "./history-table";
import { NotConnected } from "./not-connected";
import { accountTotals } from "./portfolio-math";
import { PositionCard, UnmappedCard } from "./position-card";
import { usePortfolio } from "./use-portfolio";

// The portfolio: three figures, one card per vault, two buttons for everything else.
export function PortfolioTerminal() {
  const wallet = useWallet();
  const account = wallet.account?.address ?? null;
  const portfolio = usePortfolio(account);
  const market = useOffers();
  const openOffers = market.ready && account ? market.offers.filter((o) => o.seller === account && o.state === "open").length : null;
  const [txEpoch, setTxEpoch] = React.useState(0);
  const { refresh } = portfolio;
  const afterTransaction = React.useCallback(async () => {
    await refresh();
    setTxEpoch((n) => n + 1);
  }, [refresh]);
  const totals = React.useMemo(() => (account ? accountTotals(portfolio.positions, wallet.balanceDrops) : null), [account, portfolio.positions, wallet.balanceDrops]);

  // A new wallet knows no vault. The shared market knows every vault that was ever listed, so
  // offer those to deposit into; nobody should have to paste a 64-character id to get started.
  const { rows, loadedOnce, addVault } = portfolio;
  React.useEffect(() => {
    if (!account || !loadedOnce || rows.length > 0 || !market.ready) return;
    const seen = new Set<string>();
    for (const offer of market.offers) {
      if (seen.size >= 2 || seen.has(offer.vaultId)) continue;
      seen.add(offer.vaultId);
      addVault(offer.vaultId);
    }
  }, [account, loadedOnce, rows.length, market.ready, market.offers, addVault]);
  const money = (drops: string | null | undefined) => (account && drops ? <Tick numeric={drops}>{formatXrp(drops, 2)}</Tick> : <span className="text-muted-foreground">—</span>);

  if (!account) return <NotConnected />;

  return (
    <div className="space-y-4">
      <KpiStrip className="sm:grid-cols-3 lg:grid-cols-3">
        <Kpi label="Balance" value={money(wallet.balanceDrops)} sub="wallet XRP" />
        <Kpi label="Positions" value={money(totals?.positionsValueDrops)} sub={`${portfolio.positions.length} vault${portfolio.positions.length === 1 ? "" : "s"} · accounting value`} />
        <Kpi label="Withdrawable today" value={money(totals?.withdrawableTodayDrops)} sub="limited by vault cash" />
      </KpiStrip>

      {portfolio.error && (
        <Alert variant="destructive"><Info /><AlertTitle>Could not read the ledger</AlertTitle><AlertDescription>{portfolio.error}</AlertDescription></Alert>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">{portfolio.positions.length > 0 ? "Your vaults" : "Vaults you can join"}</h2>
        <span className="text-xs text-muted-foreground">{portfolio.readAt ? `read ${new Date(portfolio.readAt).toLocaleTimeString("en-GB")} · every 15 s` : "reading…"}</span>
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => void portfolio.refresh()} disabled={portfolio.loading} aria-label="Re-read vaults from the ledger"><RefreshCw className={cn("size-3.5", portfolio.loading && "animate-spin")} /></Button>
        <AddVault onAdd={portfolio.addVault} />
      </div>

      {portfolio.rows.length === 0 && portfolio.unmapped.length === 0 ? (
        <div className="terminal-panel"><PanelEmpty className="min-h-32">{market.ready ? "No vault to show yet. Add one by id, or buy a position on the market." : "Looking for vaults…"}</PanelEmpty></div>
      ) : (
        <ul className="grid gap-3">
          {portfolio.rows.map((row) => <PositionCard key={row.vaultId} row={row} account={account} txEpoch={txEpoch} afterTransaction={afterTransaction} />)}
          {portfolio.unmapped.map((h) => <UnmappedCard key={h.shareMptId} holding={h} />)}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <DialogTrigger icon={<ListOrdered />} label={<>Orders{openOffers !== null && <span className="ml-1.5 rounded-full bg-secondary px-1.5 text-[10px] tabular-nums">{openOffers}</span>}</>} title="Your offers" description="Shared across browsers. A pending sale needs your approval from this wallet." size="xl">
          <div className="space-y-3">
            <MyOffersTable />
            <Link href={routes.sell(portfolio.selectedId ? { vault: portfolio.selectedId } : undefined)} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}><Plus /> New offer</Link>
          </div>
        </DialogTrigger>
        <DialogTrigger icon={<History />} label="History" title="History" description="Your last transactions, straight from the ledger. XRP change includes fees." size="xl">
          <HistoryTable account={account} txEpoch={txEpoch} />
        </DialogTrigger>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Every figure comes from the ledger and refreshes every 15 s. Blue is up or profit; red is down or loss.
      </p>
    </div>
  );
}

function AddVault({ onAdd }: { onAdd: (vaultId: string) => void }) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const valid = isVaultId(draft);
  return (
    <>
      <Button size="sm" variant="outline" className="ml-auto" onClick={() => setOpen(true)}><Plus /> Add vault</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Add a vault" description="Paste the id of a vault (the operator can give it to you). Your shares in it are read from the ledger." size="sm">
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!valid) return; onAdd(draft.trim().toUpperCase()); setDraft(""); setOpen(false); }}>
          <Input id="watch-vault-id" className="font-mono text-xs" placeholder="Vault id" value={draft} onChange={(e) => setDraft(e.target.value)} aria-invalid={draft.length > 0 && !valid} autoComplete="off" spellCheck={false} autoFocus />
          <Button type="submit" disabled={!valid} aria-label="Add vault">Add</Button>
        </form>
      </Dialog>
    </>
  );
}
