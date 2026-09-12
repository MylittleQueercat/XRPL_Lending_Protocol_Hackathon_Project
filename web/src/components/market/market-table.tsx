"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { shareValueDrops } from "@/lib/ledger";
import { formatRelativeTime, formatShares, formatXrp, shortAddress } from "@/lib/format";
import { routes } from "@/lib/network";
import { unitPriceDrops, type Offer } from "@/lib/offers";
import { useWallet } from "@/lib/wallet";
import { cn } from "@/lib/utils";
import { describeVsValue, filterOffers, type MarketFilter } from "./pricing";
import { OfferStatusBadge } from "./status-badge";
import { VsValueBadge } from "./vs-value-badge";
import { useOffers } from "./use-offers";
import { useVaults } from "./use-vaults";

const FILTERS: { key: MarketFilter; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "settled", label: "Settled" },
  { key: "all", label: "All" },
];

export function MarketTable() {
  const { offers, ready } = useOffers();
  const { account } = useWallet();
  const [filter, setFilter] = React.useState<MarketFilter>("open");
  const visible = React.useMemo(() => filterOffers(offers, filter), [offers, filter]);
  const vaultIds = React.useMemo(() => Array.from(new Set(visible.map((o) => o.vaultId))), [visible]);
  const vaults = useVaults(vaultIds);

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Offer status" className="flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <Button key={f.key} role="tab" aria-selected={filter === f.key} size="sm" variant={filter === f.key ? "secondary" : "ghost"} onClick={() => setFilter(f.key)}>
            {f.label}
            <span className="ml-1 font-mono text-xs text-muted-foreground">{filterOffers(offers, f.key).length}</span>
          </Button>
        ))}
      </div>

      {!ready ? (
        <TableSkeleton />
      ) : visible.length === 0 ? (
        <EmptyState filter={filter} />
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vault</TableHead>
                <TableHead>Seller</TableHead>
                <TableHead className="text-right">Shares</TableHead>
                <TableHead className="text-right">Total price</TableHead>
                <TableHead className="text-right">Unit price</TableHead>
                <TableHead>vs value</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="sr-only">Open</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((offer) => (
                <OfferRow key={offer.id} offer={offer} entry={vaults[offer.vaultId]} viewer={account?.address ?? null} />
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

function OfferRow({ offer, entry, viewer }: { offer: Offer; entry: ReturnType<typeof useVaults>[string] | undefined; viewer: string | null }) {
  const mine = viewer === offer.seller;
  const accountingValue = entry?.status === "ready" ? shareValueDrops(offer.shares, entry.vault) : null;
  return (
    <TableRow>
      <TableCell><code className="text-xs">{offer.vaultId.slice(0, 8)}…</code></TableCell>
      <TableCell>
        <code className="text-xs">{shortAddress(offer.seller)}</code>
        {mine && <span className="ml-2 text-xs text-muted-foreground">you</span>}
      </TableCell>
      <TableCell className="text-right tabular-nums">{formatShares(offer.shares)}</TableCell>
      <TableCell className="text-right tabular-nums">{formatXrp(offer.priceDrops)}</TableCell>
      <TableCell className="text-right tabular-nums text-muted-foreground">{unitPriceDrops(offer)} <span className="text-xs">drops</span></TableCell>
      <TableCell>
        {!entry || entry.status === "loading" ? (
          <Skeleton className="h-5 w-14" />
        ) : entry.status === "error" ? (
          <span className="text-xs text-muted-foreground" title={entry.message}>unavailable</span>
        ) : (
          <VsValueBadge value={describeVsValue(offer.priceDrops, accountingValue)} />
        )}
      </TableCell>
      <TableCell className="text-muted-foreground">{formatRelativeTime(offer.expiresAt)}</TableCell>
      <TableCell><OfferStatusBadge state={offer.state} /></TableCell>
      <TableCell className="text-right">
        <Link href={routes.offer(offer.id)} className={cn(buttonVariants({ size: "sm", variant: "ghost" }))} aria-label={`Open offer ${offer.id}`}>
          View <ArrowRight />
        </Link>
      </TableCell>
    </TableRow>
  );
}

function TableSkeleton() {
  return (
    <Card className="gap-3 py-4">
      <CardContent className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}

function EmptyState({ filter }: { filter: MarketFilter }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{filter === "open" ? "No open offers" : filter === "settled" ? "No settled sales yet" : "No offers"}</CardTitle>
        <CardDescription>
          Offers appear here when an investor lists vault shares from their position — typically because the vault cannot fund their withdrawal while its
          capital is out on loan. Every offer is checked against the seller&apos;s live share balance before it can settle.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Link href={routes.position} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          Go to my position <ArrowRight />
        </Link>
      </CardContent>
    </Card>
  );
}
