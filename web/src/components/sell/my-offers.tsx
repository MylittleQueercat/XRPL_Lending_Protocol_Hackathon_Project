"use client";

import * as React from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useWallet } from "@/lib/wallet";
import { unitPriceDrops, type OfferState } from "@/lib/offers";
import { performMarketAction } from "@/lib/market-client";
import { useOffers } from "@/components/market/use-offers";
import { formatRelativeTime, formatShares, formatXrp, shortHash } from "@/lib/format";
import { explorerTx, routes } from "@/lib/network";

const STATE_VARIANT: Record<OfferState, React.ComponentProps<typeof Badge>["variant"]> = {
  draft: "outline",
  open: "success",
  settling: "warning",
  settled: "default",
  cancelled: "secondary",
  expired: "secondary",
};

export function MyOffers() {
  const wallet = useWallet();
  const { account } = wallet;
  const market = useOffers();
  const offers = market.offers.filter((offer) => offer.seller === account?.address);
  const [confirming, setConfirming] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  if (!account) return null;
  const cancel = async (id: string) => {
    setError(null); setBusy(true);
    try {
      await performMarketAction({ type: "cancel", offerId: id }, wallet.requireSigner);
      await market.refresh();
    } catch (cause) { setError((cause as Error).message); }
    finally { setConfirming(null); setBusy(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your offers</CardTitle>
        <CardDescription>Shared across browsers. A pending sale needs your approval from your own connected wallet. Started settlement attempts cannot be reopened.</CardDescription>
      </CardHeader>
      <CardContent>
        {(error || market.error) && <p role="alert" className="mb-3 text-sm text-destructive">{error || market.error} <Button variant="ghost" size="sm" onClick={() => void market.refresh()}>Refresh</Button></p>}
        {!market.ready ? <p role="status" className="text-sm text-muted-foreground">Loading shared offers…</p> : offers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No offers yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Created</TableHead>
                <TableHead>Vault</TableHead>
                <TableHead className="text-right">Shares</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Unit</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {offers.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="text-muted-foreground">{formatRelativeTime(o.createdAt)}</TableCell>
                  <TableCell><Link href={routes.offer(o.id)} className="font-mono text-primary hover:underline">{o.vaultId.slice(0, 8)}…</Link></TableCell>
                  <TableCell className="text-right tabular-nums">{formatShares(o.shares)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatXrp(o.priceDrops)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{unitPriceDrops(o)}</TableCell>
                  <TableCell>
                    <Badge variant={STATE_VARIANT[o.state]}>{o.state}</Badge>
                    {o.settlement && (
                      <a href={explorerTx(o.settlement.hash)} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline">
                        {shortHash(o.settlement.hash)} <ExternalLink className="size-3" />
                      </a>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{o.state === "open" ? formatRelativeTime(o.expiresAt) : "—"}</TableCell>
                  <TableCell className="text-right">
                    {o.state === "settling" && <Link href={routes.buy(o.id)} className="text-sm font-medium text-primary hover:underline">Review sale</Link>}
                    {o.state === "open" && (
                      confirming === o.id ? (
                        <span className="inline-flex gap-1">
                          <Button size="sm" variant="destructive" disabled={busy} onClick={() => void cancel(o.id)}>Confirm cancel</Button>
                          <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>Keep</Button>
                        </span>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => setConfirming(o.id)}>Cancel</Button>
                      )
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
