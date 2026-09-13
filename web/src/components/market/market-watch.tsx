"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkline } from "@/components/charts";
import { Delta, Panel, PanelEmpty, PanelTabs, type TabDef } from "@/components/terminal";
import { DialogTrigger } from "@/components/ui/dialog";
import { estimateShareValueDrops } from "@/lib/ledger";
import { formatShares, formatXrp } from "@/lib/format";
import { routes } from "@/lib/network";
import type { Offer } from "@/lib/offers";
import { useWallet } from "@/lib/wallet";
import { cn } from "@/lib/utils";
import { describeVsValue, filterOffers, formatCountdown, summarizeMarket, type MarketFilter } from "./pricing";
import { OfferStatusBadge } from "./status-badge";
import { useNow } from "./use-now";
import { useOffers } from "./use-offers";
import { useVaultQuotes, type VaultQuote } from "./use-vault-quotes";

// The Market Watch: every vault-share offer as a quote line, priced against the vault's live NAV.
export function MarketWatch() {
  const { offers, snapshot, ready, error, refresh, refreshing } = useOffers();
  const { account } = useWallet();
  const [filter, setFilter] = React.useState<MarketFilter>("open");
  const [refreshedAt, setRefreshedAt] = React.useState<number | null>(null);
  React.useEffect(() => { if (ready) setRefreshedAt(Date.now()); }, [snapshot, ready]);

  const visible = React.useMemo(() => filterOffers(offers, filter), [offers, filter]);
  const vaultIds = React.useMemo(() => Array.from(new Set(offers.map((o) => o.vaultId))), [offers]);
  const quotes = useVaultQuotes(vaultIds, { points: 24, spanLedgers: 6_000, pollMs: 15_000 });
  const summary = React.useMemo(() => summarizeMarket(offers, (o) => { const q = quotes[o.vaultId]; return q?.status === "ready" ? estimateShareValueDrops(o.shares, q.latest) : null; }), [offers, quotes]);
  const now = useNow(1000);

  const tabs: TabDef<MarketFilter>[] = [
    { id: "open", label: "For sale", count: filterOffers(offers, "open").length },
    { id: "settled", label: "Sold", count: filterOffers(offers, "settled").length },
    { id: "all", label: "All", count: offers.length },
  ];

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {ready ? <>{summary.open} position{summary.open === 1 ? "" : "s"} for sale · typical price vs value <Delta ratio={summary.medianDiscount} className="align-middle" /> · {tabs[1].count} sold</> : "Loading the market…"}
        {refreshedAt && <span className="ml-2">refreshed {new Date(refreshedAt).toLocaleTimeString("en-GB")}</span>}
      </p>

      {error && (
        <Alert variant="warning">
          <AlertTitle>Shared marketplace unavailable</AlertTitle>
          <AlertDescription>{error} <Button variant="outline" size="sm" disabled={refreshing} onClick={() => void refresh()}>Retry</Button></AlertDescription>
        </Alert>
      )}

      <Panel
        title="Positions for sale"
        actions={
          <>
            <DialogTrigger label="How prices work" variant="ghost" buttonSize="sm" className="h-7 px-2 text-xs" title="How prices work" size="sm">
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>Each share is worth its slice of the vault&apos;s assets today. Sellers set their own price; the card compares it with that value.</p>
                <p><span className="text-up">Blue</span> means you pay less than the shares are worth, <span className="text-down">red</span> means more. A discount is a price, not a promised return: you get your money out when the vault&apos;s loans are repaid.</p>
                <p>Why would anyone sell below value? Because their money is out on loan and they want cash now.</p>
              </div>
            </DialogTrigger>
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => void refresh()} disabled={refreshing} aria-label="Refresh offers">
              <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} /> Refresh
            </Button>
          </>
        }
      >
        <PanelTabs tabs={tabs} value={filter} onChange={setFilter} ariaLabel="Offer status" />
        {!ready ? (
          <div className="space-y-2 p-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
        ) : error && offers.length === 0 ? (
          <PanelEmpty>Offers could not be loaded. Retry when your connection returns.</PanelEmpty>
        ) : visible.length === 0 ? (
          <EmptyState filter={filter} />
        ) : (
          <ul className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((offer) => (
              <OfferCard key={offer.id} offer={offer} quote={quotes[offer.vaultId]} viewer={account?.address ?? null} now={now} />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function OfferCard({ offer, quote, viewer, now }: { offer: Offer; quote: VaultQuote | undefined; viewer: string | null; now: number }) {
  const mine = viewer === offer.seller;
  const latest = quote?.status === "ready" ? quote.latest : null;
  const accountingValue = latest ? estimateShareValueDrops(offer.shares, latest) : null;
  const vs = describeVsValue(offer.priceDrops, accountingValue);
  const navSeries = quote?.samples.map((s) => s.navPerShare) ?? [];
  const href = routes.offer(offer.id);
  const remaining = Date.parse(offer.expiresAt) - now;
  const open = offer.state === "open";
  return (
    <li className={cn("terminal-panel flex flex-col p-4 transition-shadow hover:shadow-md", mine && "ring-1 ring-primary/30")}>
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs font-semibold" title={offer.vaultId}>Vault {offer.vaultId.slice(0, 8)}…</span>
        {mine && <span className="rounded bg-accent px-1 text-[10px] font-semibold uppercase text-accent-foreground">yours</span>}
        <span className="ml-auto"><OfferStatusBadge state={offer.state} /></span>
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[.1em] text-muted-foreground">Price</p>
          <p className="text-2xl font-semibold tabular-nums leading-tight">{formatXrp(offer.priceDrops).replace(" XRP", "")} <span className="text-sm font-normal text-muted-foreground">XRP</span></p>
          <p className="mt-0.5 text-xs text-muted-foreground">for {formatShares(offer.shares)} shares</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-semibold uppercase tracking-[.1em] text-muted-foreground">vs value</p>
          <div className="text-lg font-semibold">
            {latest ? <Delta ratio={vs.ratio} /> : quote?.status === "error" ? <span className="text-sm text-muted-foreground">n/a</span> : <Skeleton className="ml-auto h-6 w-16" />}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{vs.kind === "discount" ? "cheaper than the shares are worth" : vs.kind === "premium" ? "above what the shares are worth" : vs.kind === "par" ? "at value" : !open ? "priced at the time of sale" : latest ? "value unavailable" : "value loading"}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          {quote?.status === "ready" ? <Sparkline values={navSeries} width={80} height={22} /> : <Skeleton className="h-5 w-20" />}
          <span>value per share</span>
        </span>
        <span className={cn(open && remaining < 3_600_000 && remaining > 0 && "text-down")}>{open ? `${formatCountdown(remaining)} left` : offer.settlement ? "sold" : offer.state}</span>
      </div>
      <Link href={href} className={cn(buttonVariants({ size: "sm", variant: open && !mine ? "default" : "outline" }), "mt-4 w-full")}>
        {open ? (mine ? "Manage my offer" : "Buy these shares") : "See the sale"} <ArrowRight />
      </Link>
    </li>
  );
}

function EmptyState({ filter }: { filter: MarketFilter }) {
  return (
    <PanelEmpty className="min-h-40">
      <div className="max-w-md space-y-2">
        <p className="text-sm font-medium text-foreground">{filter === "open" ? "Nothing for sale right now" : filter === "settled" ? "No sale yet" : "No offers"}</p>
        <p>
          When an investor wants cash while the vault&apos;s money is out on loan, they list their shares here at their own price.
        </p>
        <Link href={routes.portfolio} className="inline-flex items-center gap-1 text-primary hover:underline">Go to my portfolio <ArrowRight className="size-3.5" /></Link>
      </div>
    </PanelEmpty>
  );
}
