"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, ArrowRight, ExternalLink, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { Stat } from "@/components/stat";
import { readNetworkStatus, readShareBalance, readVault, estimateShareValueDrops, type VaultState } from "@/lib/ledger";
import { formatPercent, formatRelativeTime, formatShares, formatXrp, shortAddress } from "@/lib/format";
import { explorerAccount, explorerTx, routes } from "@/lib/network";
import { unitPriceDrops } from "@/lib/offers";
import { useWallet } from "@/lib/wallet";
import { cn } from "@/lib/utils";
import { describeVsValue, isBuyable, sellerCanDeliver, utilisationRatio } from "./pricing";
import { OfferStatusBadge } from "./status-badge";
import { VsValueBadge } from "./vs-value-badge";
import { useOffer } from "./use-offers";

type LiveState =
  | { status: "loading" }
  | { status: "ready"; vault: VaultState; sellerShares: string; ledgerIndex: number; checkedAt: string }
  | { status: "error"; message: string };

export function OfferDetail({ id }: { id: string }) {
  const { offer, ready, error: marketError, refresh: refreshMarket } = useOffer(id);
  const { account } = useWallet();
  const [live, setLive] = React.useState<LiveState>({ status: "loading" });

  // Everything about the vault and the seller's holding is read from the validated ledger, never
  // taken from the offer record. Re-run on demand so a buyer can refresh before deciding.
  const load = React.useCallback(async () => {
    if (!offer) return;
    setLive({ status: "loading" });
    try {
      const [vault, sellerShares, network] = await Promise.all([readVault(offer.vaultId), readShareBalance(offer.seller, offer.shareMptId), readNetworkStatus()]);
      setLive({ status: "ready", vault, sellerShares, ledgerIndex: network.ledgerIndex, checkedAt: network.checkedAt });
    } catch (error) {
      setLive({ status: "error", message: (error as Error).message });
    }
  }, [offer]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (!ready) return <DetailSkeleton />;

  if (!offer) {
    return (
      <>
        <PageHeader title="Offer not found" description={marketError ?? "This offer is not present in the shared marketplace."} />
        <Link href={routes.market} className={cn(buttonVariants({ variant: "outline" }))}><ArrowLeft /> Back to market</Link>
      </>
    );
  }

  const vault = live.status === "ready" ? live.vault : null;
  const accountingValue = vault ? estimateShareValueDrops(offer.shares, vault) : null;
  const vsValue = describeVsValue(offer.priceDrops, accountingValue);
  const sellerCovers = live.status === "ready" ? sellerCanDeliver(live.sellerShares, offer.shares) : null;
  const buyable = isBuyable(offer, sellerCovers, account?.address ?? null);
  const mine = account?.address === offer.seller;

  return (
    <>
      <PageHeader
        title="Offer"
        description={`Listed ${formatRelativeTime(offer.createdAt)} · expires ${formatRelativeTime(offer.expiresAt)}`}
        action={
          <div className="flex items-center gap-2">
            <OfferStatusBadge state={offer.state} />
            <Link href={routes.market} className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}><ArrowLeft /> Market</Link>
          </div>
        }
      />

      {marketError && <Alert variant="warning" className="mb-4"><AlertTitle>Shared offer data may be stale</AlertTitle><AlertDescription>{marketError} <Button variant="outline" size="sm" onClick={() => void refreshMarket()}>Refresh marketplace</Button></AlertDescription></Alert>}
      {offer.state === "open" && live.status === "ready" && sellerCovers === false && (
        <Alert variant="warning" className="mb-4">
          <AlertTriangle />
          <AlertTitle>Seller no longer holds enough shares</AlertTitle>
          <AlertDescription>
            The seller holds {formatShares(live.sellerShares)} units of this issuance on the validated ledger, against {formatShares(offer.shares)} listed. This
            offer cannot settle as listed. Nothing is charged for an offer that cannot deliver.
          </AlertDescription>
        </Alert>
      )}
      {live.status === "error" && (
        <Alert variant="destructive" className="mb-4">
          <AlertTriangle />
          <AlertTitle>Could not read the ledger</AlertTitle>
          <AlertDescription>
            <p>{live.message}</p>
            <Button size="sm" variant="outline" onClick={() => void load()}><RefreshCw /> Retry</Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>The offer</CardTitle>
            <CardDescription>Quantity and price are exactly as the seller listed them. Accounting value is read from the vault now.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Shares" value={formatShares(offer.shares)} hint="units of the vault's share issuance" />
              <Stat label="Total price" value={formatXrp(offer.priceDrops)} />
              <Stat label="Unit price" value={<span>{unitPriceDrops(offer)} <span className="text-sm text-muted-foreground">drops / share</span></span>} />
              <Stat
                label="Accounting value"
                value={accountingValue ? formatXrp(accountingValue) : live.status === "loading" ? <Skeleton className="h-6 w-24" /> : "—"}
                hint={<span className="inline-flex items-center gap-1.5">asked price is <VsValueBadge value={vsValue} /></span>}
              />
            </div>
            <Separator />
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Seller</dt>
              <dd className="flex min-w-0 flex-wrap items-center gap-1.5">
                <code className="text-xs break-all">{offer.seller}</code>
                {mine && <Badge variant="secondary">you</Badge>}
                <a href={explorerAccount(offer.seller)} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground" aria-label="Seller in explorer"><ExternalLink className="size-3.5" /></a>
              </dd>
              <dt className="text-muted-foreground">Seller holds now</dt>
              <dd className="tabular-nums">
                {live.status === "ready" ? (
                  <span className={cn(offer.state === "open" && sellerCovers === false && "text-destructive")}>{formatShares(live.sellerShares)} units</span>
                ) : live.status === "loading" ? <Skeleton className="inline-block h-4 w-20" /> : "—"}
                {live.status === "ready" && <span className="ml-2 text-xs text-muted-foreground">validated ledger #{live.ledgerIndex.toLocaleString("en-US")}</span>}
              </dd>
              <dt className="text-muted-foreground">Created</dt>
              <dd>{new Date(offer.createdAt).toLocaleString()}</dd>
              <dt className="text-muted-foreground">Expires</dt>
              <dd>{new Date(offer.expiresAt).toLocaleString()} <span className="text-muted-foreground">({formatRelativeTime(offer.expiresAt)})</span></dd>
              <dt className="text-muted-foreground">Offer ID</dt>
              <dd><code className="text-xs">{offer.id}</code></dd>
            </dl>
            {offer.settlement && (
              <>
                <Separator />
                <div className="text-sm">
                  <p className="text-muted-foreground">Settled</p>
                  <a href={explorerTx(offer.settlement.hash)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline">
                    {offer.settlement.hash.slice(0, 8)}… · ledger {offer.settlement.ledgerIndex.toLocaleString("en-US")} <ExternalLink className="size-3" />
                  </a>
                  <p className="mt-1 text-xs text-muted-foreground">Buyer <code>{shortAddress(offer.settlement.buyer)}</code></p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>The vault</CardTitle>
            <CardDescription>State of the vault backing these shares, from the validated ledger.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {live.status === "ready" ? <VaultPanel vault={live.vault} /> : live.status === "loading" ? <VaultSkeleton /> : <p className="text-sm text-muted-foreground">Unavailable.</p>}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_20rem]">
        <Card>
          <CardHeader>
            <CardTitle>What you are buying</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
              <li>A quantity of vault shares: a proportional claim on the vault&apos;s assets, not a claim on any particular loan.</li>
              <li>The underlying loans continue unchanged. You take over the seller&apos;s exposure to them.</li>
              <li>A discount to accounting value is a price, not yield. Returns depend on borrowers repaying and on the vault&apos;s cash when you exit.</li>
              <li>Accounting value contains realised interest only. Interest is recognised when a payment delivers it, not when a loan is originated.</li>
              <li>Liquidity is not guaranteed. Withdrawing later depends on the vault holding enough available cash at that time.</li>
              <li>Settlement is one all-or-nothing Batch: your payment and the seller&apos;s share delivery apply together, or neither applies. Ownership is confirmed from the ledger afterwards, not from the submission result.</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Proceed</CardTitle>
            <CardDescription>{buyable.ok ? "Live checks passed for this offer." : buyable.reason}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {offer.state === "settling" ? (
              <Link href={routes.buy(offer.id)} className={cn(buttonVariants({ variant: "outline" }), "w-full")}>Review saved sale <ArrowRight /></Link>
            ) : mine ? (
              <Link href={routes.sell()} className={cn(buttonVariants({ variant: "outline" }), "w-full")}>Manage my offers <ArrowRight /></Link>
            ) : buyable.ok && !marketError ? (
              <Link href={routes.buy(offer.id)} className={cn(buttonVariants({ size: "lg" }), "w-full")}>Buy this position <ArrowRight /></Link>
            ) : (
              <Button size="lg" className="w-full" disabled>Buy this position</Button>
            )}
            <Button variant="ghost" size="sm" className="w-full" onClick={() => void load()} disabled={live.status === "loading"}>
              <RefreshCw className={cn(live.status === "loading" && "animate-spin")} /> Re-check on ledger
            </Button>
            {live.status === "ready" && <p className="text-center text-xs text-muted-foreground">Checked {new Date(live.checkedAt).toLocaleTimeString()}</p>}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function VaultPanel({ vault }: { vault: VaultState }) {
  const utilisation = utilisationRatio(vault);
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Assets total" value={formatXrp(vault.assetsTotalDrops)} hint="capital plus realised interest" />
        <Stat label="Available liquidity" value={formatXrp(vault.assetsAvailableDrops)} hint="cash the vault can pay out now" />
        <Stat label="Share supply" value={formatShares(vault.sharesOutstanding)} hint="units outstanding" />
        <Stat label="Shares" value={<Badge variant={vault.transferable ? "success" : "destructive"}>{vault.transferable ? "transferable" : "non-transferable"}</Badge>} />
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>Utilisation</span>
          <span className="tabular-nums">{formatPercent(utilisation)} deployed in loans</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(utilisation * 100)} aria-label="Vault utilisation">
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${utilisation * 100}%` }} />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Capital out on loan cannot fund withdrawals until borrowers repay. That is why positions get sold here.</p>
      </div>
      <Separator />
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Vault owner</dt>
        <dd className="flex items-center gap-1.5"><code className="text-xs">{shortAddress(vault.owner)}</code><a href={explorerAccount(vault.owner)} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground" aria-label="Owner in explorer"><ExternalLink className="size-3.5" /></a></dd>
        <dt className="text-muted-foreground">Vault account</dt>
        <dd className="flex items-center gap-1.5"><code className="text-xs">{shortAddress(vault.pseudoAccount)}</code><a href={explorerAccount(vault.pseudoAccount)} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground" aria-label="Vault account in explorer"><ExternalLink className="size-3.5" /></a></dd>
        <dt className="text-muted-foreground">Vault ID</dt>
        <dd><code className="text-xs break-all">{vault.vaultId}</code></dd>
        <dt className="text-muted-foreground">Share issuance</dt>
        <dd><code className="text-xs break-all">{vault.shareMptId}</code></dd>
      </dl>
    </>
  );
}

function VaultSkeleton() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
      <Skeleton className="h-2 w-full" />
      <Skeleton className="h-20 w-full" />
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-40" />
      <div className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-72" /><Skeleton className="h-72" /></div>
    </div>
  );
}
