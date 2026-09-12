"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sparkline } from "@/components/charts";
import { Delta, Kpi, KpiStrip, Panel, PanelEmpty, PanelTabs, Tick, type TabDef } from "@/components/terminal";
import { estimateShareValueDrops } from "@/lib/ledger";
import { formatPercent, formatShares, formatXrp, shortAddress } from "@/lib/format";
import { routes } from "@/lib/network";
import { unitPriceDrops, type Offer } from "@/lib/offers";
import { useWallet } from "@/lib/wallet";
import { cn } from "@/lib/utils";
import { describeVsValue, filterOffers, formatCountdown, formatDropsPerShare, summarizeMarket, type MarketFilter } from "./pricing";
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
    { id: "open", label: "Open", count: filterOffers(offers, "open").length },
    { id: "settled", label: "Settled", count: filterOffers(offers, "settled").length },
    { id: "all", label: "All", count: offers.length },
  ];

  return (
    <div className="space-y-3">
      <KpiStrip className="lg:grid-cols-5">
        <Kpi label="Open offers" value={ready ? summary.open : "—"} sub={`${summary.vaults} vault${summary.vaults === 1 ? "" : "s"} listed`} />
        <Kpi label="Listed value" value={ready ? formatXrp(summary.listedDrops, 2) : "—"} sub="sum of asked prices" />
        <Kpi label="Median discount" value={<Delta ratio={summary.medianDiscount} />} sub={summary.priced ? `${summary.priced} of ${summary.open} priced vs NAV` : "waiting for vault NAV"} />
        <Kpi label="Settled" value={ready ? tabs[1].count : "—"} sub="verified on the ledger" />
        <Kpi label="Marketplace" value={refreshedAt ? new Date(refreshedAt).toLocaleTimeString("en-GB") : "—"} sub={error ? <span className="text-down">offline · showing last read</span> : "last refresh · polls every 7.5 s"} />
      </KpiStrip>

      {error && (
        <Alert variant="warning">
          <AlertTitle>Shared marketplace unavailable</AlertTitle>
          <AlertDescription>{error} <Button variant="outline" size="sm" disabled={refreshing} onClick={() => void refresh()}>Retry</Button></AlertDescription>
        </Alert>
      )}

      <Panel
        title="Market watch"
        actions={
          <>
            <span className="hidden text-[11px] text-muted-foreground sm:inline">blue = discount to NAV · red = premium</span>
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
          <Table className="terminal-table">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Vault</TableHead>
                <TableHead className="w-28"><span className="sr-only">NAV trend, </span>24 pts</TableHead>
                <TableHead>Seller</TableHead>
                <TableHead className="text-right">Shares</TableHead>
                <TableHead className="text-right">Price XRP</TableHead>
                <TableHead className="text-right">Unit drops/sh</TableHead>
                <TableHead className="text-right">NAV/sh</TableHead>
                <TableHead className="text-right">Disc. to NAV</TableHead>
                <TableHead className="text-right">Util.</TableHead>
                <TableHead className="text-right">Expires</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-8"><span className="sr-only">Open</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((offer) => (
                <QuoteRow key={offer.id} offer={offer} quote={quotes[offer.vaultId]} viewer={account?.address ?? null} now={now} />
              ))}
            </TableBody>
          </Table>
        )}
        <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
          NAV per share is the vault&apos;s accounting value (realised interest only, cash basis) divided by shares outstanding, read from the validated ledger.
          A discount is a price, not a yield. Utilisation is the share of assets out on loan: that cash cannot fund withdrawals until borrowers repay.
        </p>
      </Panel>
    </div>
  );
}

function QuoteRow({ offer, quote, viewer, now }: { offer: Offer; quote: VaultQuote | undefined; viewer: string | null; now: number }) {
  const router = useRouter();
  const mine = viewer === offer.seller;
  const latest = quote?.status === "ready" ? quote.latest : null;
  const accountingValue = latest ? estimateShareValueDrops(offer.shares, latest) : null;
  const vs = describeVsValue(offer.priceDrops, accountingValue);
  const navSeries = quote?.samples.map((s) => s.navPerShare) ?? [];
  const href = routes.offer(offer.id);
  const remaining = Date.parse(offer.expiresAt) - now;
  return (
    <TableRow
      className="cursor-pointer"
      data-active={mine || undefined}
      onClick={(event) => { if (!(event.target as HTMLElement).closest("a")) router.push(href); }}
    >
      <TableCell><code className="text-xs">{offer.vaultId.slice(0, 8)}…</code></TableCell>
      <TableCell className="py-1">
        {quote?.status === "ready" ? <Sparkline values={navSeries} width={96} height={24} /> : quote?.status === "error" ? <span className="text-xs text-muted-foreground" title={quote.message}>n/a</span> : <Skeleton className="h-5 w-24" />}
      </TableCell>
      <TableCell>
        <code className="text-xs">{shortAddress(offer.seller)}</code>
        {mine && <span className="ml-1.5 rounded bg-accent px-1 text-[10px] font-semibold uppercase text-accent-foreground">you</span>}
      </TableCell>
      <TableCell className="text-right">{formatShares(offer.shares)}</TableCell>
      <TableCell className="text-right font-medium">{formatXrp(offer.priceDrops).replace(" XRP", "")}</TableCell>
      <TableCell className="text-right text-muted-foreground">{formatDropsPerShare(unitPriceDrops(offer))}</TableCell>
      <TableCell className="text-right">
        {latest ? <Tick numeric={latest.navPerShare}>{formatDropsPerShare(latest.navPerShare)}</Tick> : quote?.status === "error" ? <span className="text-muted-foreground">—</span> : <Skeleton className="ml-auto h-4 w-16" />}
      </TableCell>
      <TableCell className="text-right">
        {latest ? <Delta ratio={vs.ratio} /> : quote?.status === "error" ? <span className="text-xs text-muted-foreground">unavailable</span> : <Skeleton className="ml-auto h-4 w-14" />}
      </TableCell>
      <TableCell className="text-right text-muted-foreground">{latest ? formatPercent(latest.utilisation, 0) : "—"}</TableCell>
      <TableCell className={cn("text-right", offer.state === "open" && remaining < 3_600_000 && remaining > 0 && "text-down")}>
        {offer.state === "open" ? formatCountdown(remaining) : "—"}
      </TableCell>
      <TableCell><OfferStatusBadge state={offer.state} /></TableCell>
      <TableCell className="pr-2 text-right">
        <Link href={href} className="inline-flex text-muted-foreground hover:text-foreground" aria-label={`Open offer ${offer.id}`}><ArrowRight className="size-4" /></Link>
      </TableCell>
    </TableRow>
  );
}

function EmptyState({ filter }: { filter: MarketFilter }) {
  return (
    <PanelEmpty className="min-h-40">
      <div className="max-w-md space-y-2">
        <p className="text-sm font-medium text-foreground">{filter === "open" ? "No open offers" : filter === "settled" ? "No settled sales yet" : "No offers"}</p>
        <p>
          Offers appear here when an investor lists vault shares from their portfolio, typically because the vault cannot fund their withdrawal while its
          capital is out on loan. Every offer is checked against the seller&apos;s live share balance before it can settle.
        </p>
        <Link href={routes.portfolio} className="inline-flex items-center gap-1 text-primary hover:underline">Go to my portfolio <ArrowRight className="size-3.5" /></Link>
      </div>
    </PanelEmpty>
  );
}
