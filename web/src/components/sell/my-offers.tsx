"use client";

import * as React from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Panel, PanelEmpty } from "@/components/terminal";
import { useWallet } from "@/lib/wallet";
import { unitPriceDrops } from "@/lib/offers";
import { performMarketAction } from "@/lib/market-client";
import { useOffers } from "@/components/market/use-offers";
import { OfferStatusBadge } from "@/components/market/status-badge";
import { formatDropsPerShare } from "@/components/market/pricing";
import { formatRelativeTime, formatShares, formatXrp, shortHash } from "@/lib/format";
import { explorerTx, routes } from "@/lib/network";
import { cn } from "@/lib/utils";

// Cancelling is a wallet-signed marketplace intent, not a ledger transaction. Shared by the
// orders table and the seller's view of their own offer.
export function useCancelOffer(onDone?: () => Promise<unknown> | void) {
  const wallet = useWallet();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const cancel = React.useCallback(async (offerId: string) => {
    setError(null); setBusy(true);
    try {
      await performMarketAction({ type: "cancel", offerId }, wallet.requireSigner);
      await onDone?.();
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }, [wallet.requireSigner, onDone]);
  return { cancel, busy, error, clearError: () => setError(null) };
}

// Two-step cancel: "Cancel" then "Confirm cancel" / "Keep". Never cancels on one click.
export function CancelOfferButton({ offerId, onDone, className, size = "sm" }: { offerId: string; onDone?: () => Promise<unknown> | void; className?: string; size?: "sm" | "default" }) {
  const [confirming, setConfirming] = React.useState(false);
  const { cancel, busy, error } = useCancelOffer(onDone);
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      {confirming ? (
        <>
          <Button size={size} variant="destructive" disabled={busy} onClick={() => void cancel(offerId).finally(() => setConfirming(false))}>{busy ? "Cancelling…" : "Confirm cancel"}</Button>
          <Button size={size} variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>Keep</Button>
        </>
      ) : (
        <Button size={size} variant="outline" onClick={() => setConfirming(true)}>Cancel offer</Button>
      )}
      {error && <span role="alert" className="basis-full text-xs text-destructive">{error}</span>}
    </span>
  );
}

// The connected wallet's offers as an orders table: no panel chrome, so the portfolio can embed it.
export function MyOffersTable({ className }: { className?: string }) {
  const { account } = useWallet();
  const market = useOffers();
  const offers = market.offers.filter((offer) => offer.seller === account?.address);
  const { cancel, busy, error } = useCancelOffer(market.refresh);
  const [confirming, setConfirming] = React.useState<string | null>(null);
  if (!account) return <PanelEmpty className={className}>Connect a wallet to see your offers.</PanelEmpty>;
  return (
    <div className={className}>
      {(error || market.error) && (
        <p role="alert" className="border-b border-border px-3 py-2 text-xs text-destructive">
          {error || market.error} <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => void market.refresh()}>Refresh</Button>
        </p>
      )}
      {!market.ready ? (
        <p role="status" className="px-3 py-3 text-xs text-muted-foreground">Loading shared offers…</p>
      ) : offers.length === 0 ? (
        <PanelEmpty>No offers yet. Published offers appear here and on the market for every browser using this marketplace.</PanelEmpty>
      ) : (
        <Table className="terminal-table">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Created</TableHead>
              <TableHead>Vault</TableHead>
              <TableHead className="text-right">Shares</TableHead>
              <TableHead className="text-right">Price XRP</TableHead>
              <TableHead className="text-right">Per share</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Expires</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {offers.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="text-muted-foreground">{formatRelativeTime(o.createdAt)}</TableCell>
                <TableCell><Link href={routes.offer(o.id)} className="font-mono text-xs text-primary hover:underline">{o.vaultId.slice(0, 8)}…</Link></TableCell>
                <TableCell className="text-right">{formatShares(o.shares)}</TableCell>
                <TableCell className="text-right font-medium">{formatXrp(o.priceDrops).replace(" XRP", "")}</TableCell>
                <TableCell className="text-right text-muted-foreground">{formatDropsPerShare(unitPriceDrops(o))}</TableCell>
                <TableCell>
                  <OfferStatusBadge state={o.state} />
                  {o.settlement && (
                    <a href={explorerTx(o.settlement.hash)} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 font-mono text-[11px] text-primary hover:underline">
                      {shortHash(o.settlement.hash)} <ExternalLink className="size-3" />
                    </a>
                  )}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">{o.state === "open" ? formatRelativeTime(o.expiresAt) : "—"}</TableCell>
                <TableCell className="text-right">
                  {o.state === "settling" && <Link href={routes.offer(o.id)} className="text-xs font-medium text-primary hover:underline">Review sale</Link>}
                  {o.state === "open" && (
                    confirming === o.id ? (
                      <span className="inline-flex gap-1">
                        <Button size="sm" className="h-7 px-2.5" variant="destructive" disabled={busy} onClick={() => void cancel(o.id).finally(() => setConfirming(null))}>{busy ? "Cancelling…" : "Confirm cancel"}</Button>
                        <Button size="sm" className="h-7 px-2.5" variant="ghost" disabled={busy} onClick={() => setConfirming(null)}>Keep</Button>
                      </span>
                    ) : (
                      <Button size="sm" className="h-7 px-2.5" variant="outline" onClick={() => setConfirming(o.id)}>Cancel</Button>
                    )
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

// The orders panel on the sell screen.
export function MyOffers({ className }: { className?: string }) {
  const { account } = useWallet();
  if (!account) return null;
  return (
    <Panel title="My offers" className={className} actions={<span className="text-[11px] text-muted-foreground">shared across browsers · a pending sale needs your approval from this wallet</span>}>
      <MyOffersTable />
      <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
        Expiry and cancellation stop new purchase requests; they do not revoke an already signed Batch. Started settlement attempts stay locked until their exact outcome is resolved.
      </p>
    </Panel>
  );
}
