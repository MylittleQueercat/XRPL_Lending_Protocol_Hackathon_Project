"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, ExternalLink, Landmark, LineChart, RefreshCw } from "lucide-react";
import { DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DonutChart, TimeSeriesChart, chartColor, dropsToXrpNumber, useVaultHistory, type Marker } from "@/components/charts";
import { Delta, Kpi, KpiStrip, Panel, Tick } from "@/components/terminal";
import { BuyPanel } from "@/components/buy/buy-panel";
import { readNetworkStatus, readShareBalance, readVault, estimateShareValueDrops, type VaultState } from "@/lib/ledger";
import { navPerShare, readAccountActivity, type ActivityItem } from "@/lib/history";
import { formatPercent, formatRelativeTime, formatShares, formatXrp, shortAddress } from "@/lib/format";
import { explorerAccount, explorerTx, routes } from "@/lib/network";
import { unitPriceDrops } from "@/lib/offers";
import { useWallet } from "@/lib/wallet";
import { cn } from "@/lib/utils";
import { describeVsValue, formatCountdown, formatDropsPerShare, sellerCanDeliver, utilisationRatio } from "./pricing";
import { OfferStatusBadge } from "./status-badge";
import { useNow } from "./use-now";
import { useOffer } from "./use-offers";

type LiveState =
  | { status: "loading" }
  | { status: "ready"; vault: VaultState; sellerShares: string; ledgerIndex: number; checkedAt: string }
  | { status: "error"; message: string };

const MARKER_LABEL: Partial<Record<ActivityItem["kind"], string>> = { VaultDeposit: "Deposit", VaultWithdraw: "Withdraw", LoanSet: "Loan", LoanPay: "Repay" };

// One page per offer: the figures, the vault's real NAV history against the asked price, the vault
// itself, and the sale ticket. The buy flow lives here; /buy/[id] redirects to this page.
export function OfferDetail({ id }: { id: string }) {
  const market = useOffer(id);
  const { offer, ready, error: marketError, refresh: refreshMarket } = market;
  const { account } = useWallet();
  const [live, setLive] = React.useState<LiveState>({ status: "loading" });
  const [activity, setActivity] = React.useState<ActivityItem[]>([]);
  const history = useVaultHistory(offer?.vaultId ?? null, { points: 48, spanLedgers: 12_000, pollMs: 10_000 });
  const now = useNow(1000);

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

  React.useEffect(() => { void load(); }, [load]);

  const pseudoAccount = live.status === "ready" ? live.vault.pseudoAccount : null;
  React.useEffect(() => {
    if (!pseudoAccount) return;
    let cancelled = false;
    readAccountActivity(pseudoAccount, 60).then((items) => { if (!cancelled) setActivity(items); }).catch(() => { /* markers are decoration; the chart stands without them */ });
    return () => { cancelled = true; };
  }, [pseudoAccount]);

  if (!ready) return <DetailSkeleton />;

  if (!offer) {
    return (
      <Panel title="Offer not found">
        <div className="space-y-3 p-4 text-sm text-muted-foreground">
          <p>{marketError ?? "This offer is not present in the shared marketplace."}</p>
          <Link href={routes.market} className="inline-flex items-center gap-1 text-primary hover:underline"><ArrowLeft className="size-3.5" /> Back to market</Link>
        </div>
      </Panel>
    );
  }

  const vault = live.status === "ready" ? live.vault : null;
  const latest = history.latest;
  // NAV now comes from the live-polled history sample when present, otherwise from the one-off read.
  const navSource = latest ?? vault;
  const accountingValue = navSource ? estimateShareValueDrops(offer.shares, navSource) : null;
  const vsValue = describeVsValue(offer.priceDrops, accountingValue);
  const navNow = latest ? latest.navPerShare : vault ? navPerShare(vault.assetsTotalDrops, vault.lossUnrealizedDrops ?? "0", vault.sharesOutstanding) : null;
  const sellerCovers = live.status === "ready" ? sellerCanDeliver(live.sellerShares, offer.shares) : null;
  const mine = account?.address === offer.seller;
  const unitPrice = Number(unitPriceDrops(offer));
  const remaining = Date.parse(offer.expiresAt) - now;

  const chartData = history.samples.map((s) => ({ time: s.time, nav: s.sharesOutstanding === "0" ? null : s.navPerShare, ask: unitPrice }));
  const windowStart = chartData[0]?.time ?? Infinity;
  const markers: Marker[] = activity
    .filter((a) => a.resultCode === "tesSUCCESS" && MARKER_LABEL[a.kind] && a.time >= windowStart)
    .slice(0, 12)
    .map((a) => ({ x: a.time, label: MARKER_LABEL[a.kind] as string, color: a.kind === "VaultDeposit" || a.kind === "LoanPay" ? chartColor.up : a.kind === "VaultWithdraw" || a.kind === "LoanSet" ? chartColor.down : undefined }));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Link href={routes.market} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" /> Market</Link>
        <h1 className="text-base font-semibold">Offer <code className="text-sm font-normal text-muted-foreground">{offer.id.slice(0, 8)}…</code></h1>
        <OfferStatusBadge state={offer.state} />
        <span className="text-xs text-muted-foreground">listed {formatRelativeTime(offer.createdAt)}</span>
      </div>

      {marketError && <Alert variant="warning"><AlertTitle>Shared offer data may be stale</AlertTitle><AlertDescription>{marketError} <Button variant="outline" size="sm" onClick={() => void refreshMarket()}>Refresh marketplace</Button></AlertDescription></Alert>}
      {offer.state === "open" && live.status === "ready" && sellerCovers === false && (
        <Alert variant="warning">
          <AlertTriangle />
          <AlertTitle>Seller no longer holds enough shares</AlertTitle>
          <AlertDescription>
            The seller holds {formatShares(live.sellerShares)} units of this issuance on the validated ledger, against {formatShares(offer.shares)} listed. This
            offer cannot settle as listed. Nothing is charged for an offer that cannot deliver.
          </AlertDescription>
        </Alert>
      )}
      {live.status === "error" && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Could not read the ledger</AlertTitle>
          <AlertDescription>
            <p>{live.message}</p>
            <Button size="sm" variant="outline" onClick={() => void load()}><RefreshCw /> Retry</Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-3">
          <KpiStrip className="sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Price" value={formatXrp(offer.priceDrops).replace(" XRP", "")} sub={`XRP for ${formatShares(offer.shares)} shares · ${formatDropsPerShare(unitPrice)} drops each`} />
            <Kpi label="NAV / share now" value={navNow !== null && Number.isFinite(navNow) ? <Tick numeric={navNow}>{formatDropsPerShare(navNow)}</Tick> : live.status === "loading" || history.status === "loading" ? <span className="text-muted-foreground">…</span> : "—"} sub={accountingValue ? `${formatXrp(accountingValue, 2)} for the lot` : "accounting value"} />
            <Kpi label="Discount to NAV" value={<Delta ratio={vsValue.ratio} />} sub={vsValue.kind === "discount" ? "below value · not yield" : vsValue.kind === "premium" ? "above value" : vsValue.kind === "par" ? "at value" : "value unavailable"} />
            <Kpi label="Expires" value={offer.state === "open" ? formatCountdown(remaining) : "—"} tone={offer.state === "open" && remaining > 0 && remaining < 3_600_000 ? "down" : undefined} sub={new Date(offer.expiresAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} />
          </KpiStrip>

          <div className="flex flex-wrap gap-2">
            <DialogTrigger label="Chart" icon={<LineChart />} title="NAV per share against the asked price" description="Real vault state at past ledgers. Blue when NAV rose over the window, red when it fell; markers are the vault's own deposits, withdrawals, loans and repayments." size="xl">
          <Panel
            title="NAV per share · asked price"
            actions={
              <span className="flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1"><span className="inline-block h-0.5 w-4 bg-[var(--chart-1)]" aria-hidden /> NAV / share</span>
                <span className="inline-flex items-center gap-1"><span className="inline-block h-0 w-4 border-t border-dashed border-muted-foreground" aria-hidden /> asked</span>
                {history.status === "loading" && <RefreshCw className="size-3 animate-spin" aria-label="Loading history" />}
                {history.status === "error" && <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => void history.refresh()}>Retry history</Button>}
              </span>
            }
            bodyClassName="px-2 pt-2"
          >
            <TimeSeriesChart
              data={chartData}
              series={[
                { key: "nav", label: "NAV / share", format: (v) => `${formatDropsPerShare(v)} drops`, area: true },
                { key: "ask", label: "Asked unit price", format: (v) => `${formatDropsPerShare(v)} drops`, dashed: true, color: chartColor.muted },
              ]}
              yFormat={(v) => formatDropsPerShare(v)}
              markers={markers}
              directional
              height={240}
              emptyLabel={history.status === "error" ? `History unavailable: ${history.error}` : history.status === "loading" ? "Reading vault history from the validated ledger…" : "No history yet"}
            />
            <p className="px-2 pb-2 pt-1 text-[11px] text-muted-foreground">
              Real vault state at {history.samples.length || "…"} past ledgers, {history.first ? `since ledger #${history.first.ledgerIndex.toLocaleString("en-US")}` : "last ~12,000 ledgers"}. The line is blue when NAV rose over the window and red when it fell. Markers are the vault&apos;s own deposits, withdrawals, loans and repayments.
            </p>
          </Panel>

            </DialogTrigger>
            <DialogTrigger label="Vault and seller" icon={<Landmark />} title="Vault, seller and record" size="xl">
              <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <Panel title="Vault" actions={vault && <span className="text-[11px] text-muted-foreground">ledger #{vault.ledgerIndex.toLocaleString("en-US")}</span>}>
              {vault ? <VaultPanel vault={vault} /> : live.status === "loading" ? <VaultSkeleton /> : <p className="p-3 text-sm text-muted-foreground">Unavailable.</p>}
            </Panel>

            <Panel title="Seller and record">
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 p-3 text-xs">
                <dt className="text-muted-foreground">Seller</dt>
                <dd className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <code className="break-all">{offer.seller}</code>
                  {mine && <span className="rounded bg-accent px-1 text-[10px] font-semibold uppercase text-accent-foreground">you</span>}
                  <a href={explorerAccount(offer.seller)} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground" aria-label="Seller in explorer"><ExternalLink className="size-3.5" /></a>
                </dd>
                <dt className="text-muted-foreground">Seller holds now</dt>
                <dd className="tabular-nums">
                  {live.status === "ready" ? (
                    <span className={cn(offer.state === "open" && sellerCovers === false && "text-down")}>{formatShares(live.sellerShares)} units</span>
                  ) : live.status === "loading" ? <Skeleton className="inline-block h-3.5 w-20" /> : "—"}
                  {live.status === "ready" && <span className="ml-2 text-muted-foreground">validated #{live.ledgerIndex.toLocaleString("en-US")}</span>}
                </dd>
                <dt className="text-muted-foreground">Created</dt>
                <dd>{new Date(offer.createdAt).toLocaleString("en-GB")}</dd>
                <dt className="text-muted-foreground">Expires</dt>
                <dd>{new Date(offer.expiresAt).toLocaleString("en-GB")} <span className="text-muted-foreground">({formatRelativeTime(offer.expiresAt)})</span></dd>
                <dt className="text-muted-foreground">Offer ID</dt>
                <dd><code className="break-all">{offer.id}</code></dd>
                {offer.settlement && (
                  <>
                    <dt className="text-muted-foreground">Settled</dt>
                    <dd>
                      <a href={explorerTx(offer.settlement.hash)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-primary hover:underline">
                        {offer.settlement.hash.slice(0, 8)}… · ledger {offer.settlement.ledgerIndex.toLocaleString("en-US")} <ExternalLink className="size-3" />
                      </a>
                      <span className="ml-2 text-muted-foreground">buyer <code>{shortAddress(offer.settlement.buyer)}</code></span>
                    </dd>
                  </>
                )}
              </dl>
              <div className="flex items-center justify-between border-t border-border px-3 py-1.5">
                <span className="text-[11px] text-muted-foreground">{live.status === "ready" ? `Checked ${new Date(live.checkedAt).toLocaleTimeString("en-GB")}` : ""}</span>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => void load()} disabled={live.status === "loading"}>
                  <RefreshCw className={cn("size-3.5", live.status === "loading" && "animate-spin")} /> Re-check on ledger
                </Button>
              </div>
            </Panel>
          </div>

          <Panel title="What you are buying">
            <ul className="list-disc space-y-1.5 p-3 pl-7 text-sm text-muted-foreground">
              <li>A quantity of vault shares: a proportional claim on the vault&apos;s assets, not a claim on any particular loan.</li>
              <li>The underlying loans continue unchanged. You take over the seller&apos;s exposure to them.</li>
              <li>A discount to accounting value is a price, not yield. Returns depend on borrowers repaying and on the vault&apos;s cash when you exit.</li>
              <li>Accounting value contains realised interest only. Interest is recognised when a payment delivers it, not when a loan is originated.</li>
              <li>Liquidity is not guaranteed. Withdrawing later depends on the vault holding enough available cash at that time.</li>
              <li>Settlement is one all-or-nothing Batch: your payment and the seller&apos;s share delivery apply together, or neither applies. Ownership is confirmed from the ledger afterwards, not from the submission result.</li>
            </ul>
          </Panel>
              </div>
            </DialogTrigger>
          </div>
        </div>

        <div className="min-w-0 lg:sticky lg:top-4 lg:self-start">
          <BuyPanel offerId={id} market={market} />
        </div>
      </div>
    </div>
  );
}

function VaultPanel({ vault }: { vault: VaultState }) {
  const utilisation = utilisationRatio(vault);
  // Chart proportions only; the figures beside the donut are exact drop strings.
  const total = dropsToXrpNumber(vault.assetsTotalDrops);
  const cash = dropsToXrpNumber(vault.assetsAvailableDrops);
  return (
    <div className="space-y-2 p-3">
      <div className="grid grid-cols-[auto_1fr] items-center gap-3">
        <DonutChart
          size={120}
          slices={[{ name: "On loan", value: Math.max(0, total - cash), color: chartColor.c4 }, { name: "Cash", value: cash, color: chartColor.c1 }]}
          centerValue={formatPercent(utilisation, 0)}
          centerLabel="on loan"
          format={(v) => `${v.toLocaleString("en-US", { maximumFractionDigits: 2 })} XRP`}
        />
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-muted-foreground">Assets total</dt><dd className="text-right tabular-nums font-medium">{formatXrp(vault.assetsTotalDrops)}</dd>
          <dt className="text-muted-foreground">Cash available</dt><dd className="text-right tabular-nums">{formatXrp(vault.assetsAvailableDrops)}</dd>
          <dt className="text-muted-foreground">Share supply</dt><dd className="text-right tabular-nums">{formatShares(vault.sharesOutstanding)}</dd>
          <dt className="text-muted-foreground">Transfer</dt><dd className={cn("text-right", vault.transferable ? "text-foreground" : "text-down")}>{vault.transferable ? "transferable" : "non-transferable"}</dd>
        </dl>
      </div>
      <p className="text-[11px] text-muted-foreground">Capital out on loan cannot fund withdrawals until borrowers repay. That is why positions get sold here. Assets total is capital plus realised interest.</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-border pt-2 text-xs">
        <dt className="text-muted-foreground">Owner</dt>
        <dd className="flex items-center gap-1.5"><code>{shortAddress(vault.owner)}</code><a href={explorerAccount(vault.owner)} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground" aria-label="Owner in explorer"><ExternalLink className="size-3.5" /></a></dd>
        <dt className="text-muted-foreground">Vault account</dt>
        <dd className="flex items-center gap-1.5"><code>{shortAddress(vault.pseudoAccount)}</code><a href={explorerAccount(vault.pseudoAccount)} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground" aria-label="Vault account in explorer"><ExternalLink className="size-3.5" /></a></dd>
        <dt className="text-muted-foreground">Vault ID</dt>
        <dd><code className="break-all">{vault.vaultId}</code></dd>
        <dt className="text-muted-foreground">Issuance</dt>
        <dd><code className="break-all">{vault.shareMptId}</code></dd>
      </dl>
    </div>
  );
}

function VaultSkeleton() {
  return (
    <div className="space-y-3 p-3">
      <div className="grid grid-cols-[auto_1fr] gap-3"><Skeleton className="size-[120px] rounded-full" /><Skeleton className="h-24" /></div>
      <Skeleton className="h-20 w-full" />
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-6 w-48" />
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-3"><Skeleton className="h-20" /><Skeleton className="h-64" /><Skeleton className="h-48" /></div>
        <Skeleton className="h-96" />
      </div>
    </div>
  );
}
