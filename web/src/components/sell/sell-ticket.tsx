"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Info, LineChart, ListOrdered, RefreshCw, Wallet as WalletIcon } from "lucide-react";
import { DialogTrigger } from "@/components/ui/dialog";
import { MyOffersTable } from "./my-offers";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { TimeSeriesChart, useVaultHistory } from "@/components/charts";
import { Delta, Kpi, KpiStrip, Panel, PanelEmpty, Tick } from "@/components/terminal";
import { ValueBadge } from "@/components/value-badge";
import { formatDropsPerShare, utilisationRatio } from "@/components/market/pricing";
import { describeRatio } from "@/lib/pricing";
import { useWallet } from "@/lib/wallet";
import { discountRatio, unitPriceDrops, type Offer } from "@/lib/offers";
import { performMarketAction, toDisplayOffer } from "@/lib/market-client";
import { estimateShareValueDrops, readShareBalance, readVault, type VaultState } from "@/lib/ledger";
import { navPerShare } from "@/lib/history";
import { formatPercent, formatShares, formatXrp, shortAddress, xrpToDrops } from "@/lib/format";
import { TRACK1, routes } from "@/lib/network";
import { cn } from "@/lib/utils";
import { EXPIRY_OPTIONS, QUICK_FILLS, computeReview, dropsToXrpInput, isVaultId, priceAtDiscountDrops, readKnownVaults, rememberVault, type Review } from "./review";

// The sell screen as an order ticket: position on the left, ticket on the right, one review
// confirmation before the wallet-signed publish. The three steps (position, terms, review) are
// still enforced: nothing can be published before the position is read and the terms reviewed.
export function SellTicket() {
  const params = useSearchParams();
  const wallet = useWallet();
  const address = wallet.account?.address ?? null;

  const [vaultInput, setVaultInput] = React.useState(params.get("vault") ?? "");
  const [knownVaults, setKnownVaults] = React.useState<string[]>([]);
  const [vault, setVault] = React.useState<VaultState | null>(null);
  const [balance, setBalance] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const [shares, setShares] = React.useState(params.get("shares") ?? "");
  const [priceXrp, setPriceXrp] = React.useState("");
  const [expiryHours, setExpiryHours] = React.useState<number>(24);
  const [reviewing, setReviewing] = React.useState(false);

  const [published, setPublished] = React.useState<Offer | null>(null);
  const [publishing, setPublishing] = React.useState(false);
  const [publishError, setPublishError] = React.useState<string | null>(null);

  const history = useVaultHistory(vault?.vaultId ?? null, { points: 48, spanLedgers: 12_000, pollMs: 10_000 });

  React.useEffect(() => setKnownVaults(readKnownVaults()), []);

  const loadPosition = React.useCallback(async (id?: string) => {
    const target = (id ?? vaultInput).trim().toUpperCase();
    if (!address || !isVaultId(target)) return;
    setLoading(true);
    setLoadError(null);
    setVault(null);
    setBalance(null);
    setReviewing(false);
    try {
      const v = await readVault(target);
      const held = await readShareBalance(address, v.shareMptId);
      setVault(v);
      setBalance(held);
      setKnownVaults(rememberVault(target));
    } catch (cause) {
      setLoadError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }, [address, vaultInput]);

  // Prefilled from the portfolio: load immediately once a wallet is connected.
  const prefilled = params.get("vault");
  React.useEffect(() => {
    if (prefilled && address && isVaultId(prefilled) && !vault && !loading) void loadPosition(prefilled);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefilled, address]);

  const { errors, review } = React.useMemo(() => {
    if (!vault || !address || balance === null) return { errors: { general: [] as string[] }, review: null as Review | null };
    return computeReview({ shares, priceXrp, expiryHours }, { vault, seller: address, balance, networkId: TRACK1.networkId });
  }, [vault, address, balance, shares, priceXrp, expiryHours]);

  // Live preview while typing, even when one field is still invalid.
  const latest = history.latest;
  const navSource = latest ?? vault;
  const quantityValueDrops = vault && /^[1-9]\d*$/.test(shares) ? estimateShareValueDrops(shares, navSource ?? vault) : null;
  const typedPriceDrops = xrpToDrops(priceXrp);
  const previewUnit = typedPriceDrops && /^[1-9]\d*$/.test(shares) ? unitPriceDrops({ priceDrops: typedPriceDrops, shares }) : null;
  const previewRatio = typedPriceDrops && quantityValueDrops ? discountRatio(typedPriceDrops, quantityValueDrops) : null;

  const positionReady = !!vault && balance !== null;
  const canSell = positionReady && BigInt(balance) > 0n && vault.transferable;
  const blocked = !!wallet.networkError || publishing;
  const navNow = vault ? (latest ? latest.navPerShare : navPerShare(vault.assetsTotalDrops, vault.lossUnrealizedDrops ?? "0", vault.sharesOutstanding)) : null;
  const heldValueDrops = vault && balance !== null ? estimateShareValueDrops(balance, navSource ?? vault) : null;
  const utilisation = latest ? latest.utilisation : vault ? utilisationRatio(vault) : null;

  const fill = (bps: number) => {
    if (!quantityValueDrops) return;
    const drops = priceAtDiscountDrops(quantityValueDrops, bps);
    if (drops) setPriceXrp(dropsToXrpInput(drops));
  };

  const publish = async () => {
    if (!review || !vault || !address) return;
    setPublishError(null);
    setPublishing(true);
    try {
      const result = await performMarketAction({ type: "create", input: {
        networkId: TRACK1.networkId as 4001,
        priceAsset: { currency: "XRP" },
        vaultId: vault.vaultId,
        shareMptId: vault.shareMptId,
        seller: address,
        sharesRaw: review.shares,
        priceDrops: review.priceDrops,
        expiresAt: review.expiresAt,
      } }, wallet.requireSigner);
      const created = result.offers.filter((offer) => offer.seller === address && offer.vaultId === vault.vaultId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      if (!created) throw new Error("Offer saved but could not be loaded. Check My offers before publishing again.");
      setPublished(toDisplayOffer(created));
      setShares("");
      setPriceXrp("");
      setExpiryHours(24);
      setReviewing(false);
      // The listed quantity may have changed what can still be sold; re-read the holding.
      void loadPosition(vault.vaultId);
    } catch (cause) {
      setPublishError(`${(cause as Error).message} Check My offers before retrying: a connection failure can happen after the offer was saved.`);
    } finally {
      setPublishing(false);
    }
  };

  if (!address) {
    return (
      <Panel title="Sell shares">
        <div className="space-y-2 p-4 text-sm">
          <p className="flex items-center gap-2 font-medium"><WalletIcon className="size-4 text-primary" /> Connect a wallet to sell</p>
          <p className="text-muted-foreground">
            Selling transfers your vault-share position to another investor at a price you set; the buyer pays you and takes over the exposure.
            The underlying loans continue unchanged, and the sale settles all-or-nothing on the ledger.
          </p>
          <p className="text-muted-foreground">Use the wallet button in the header. Publishing signs a marketplace authorization with your wallet. It does not move XRP or shares.</p>
        </div>
      </Panel>
    );
  }

  const chartData = history.samples.map((s) => ({ time: s.time, nav: s.sharesOutstanding === "0" ? null : s.navPerShare }));

  return (
    <div className="space-y-3">
      {published && (
        <Alert className="raise-state" variant="success">
          <CheckCircle2 />
          <AlertTitle>Offer published, waiting for a buyer</AlertTitle>
          <AlertDescription>
            <p>
              {formatShares(published.shares)} units for {formatXrp(published.priceDrops)}.{" "}
              <Link href={routes.offer(published.id)} className="font-medium text-primary hover:underline">View the offer</Link>.
            </p>
            <p>Your offer is shared with every browser using this marketplace. Expiry and cancellation are enforced by Raise. The ledger verifies ownership at settlement.</p>
          </AlertDescription>
        </Alert>
      )}
      {wallet.networkError && (
        <Alert variant="destructive"><Info /><AlertTitle>Offers are paused</AlertTitle><AlertDescription>{wallet.networkError}</AlertDescription></Alert>
      )}

      <div className="mx-auto max-w-2xl space-y-3">
        {/* Position: which vault, what you hold, what it is worth now. */}
        <div className="min-w-0 space-y-3">
          <Panel title="Position" actions={vault && <span className="text-[11px] text-muted-foreground">validated ledger #{vault.ledgerIndex.toLocaleString("en-US")}</span>}>
            <form
              className="flex flex-col gap-2 p-3 sm:flex-row sm:items-end"
              onSubmit={(e) => { e.preventDefault(); void loadPosition(); }}
            >
              <div className="min-w-0 flex-1 space-y-1">
                <Label htmlFor="vault" className="text-xs">Vault ID</Label>
                <Input id="vault" list="known-vaults" className="h-9 font-mono text-xs" placeholder="64-character hex ledger index" value={vaultInput} onChange={(e) => setVaultInput(e.target.value)} spellCheck={false} autoComplete="off" />
                <datalist id="known-vaults">{knownVaults.map((v) => <option key={v} value={v} />)}</datalist>
              </div>
              <Button type="submit" variant="outline" size="sm" className="h-9" disabled={!isVaultId(vaultInput) || loading}>{loading ? <><RefreshCw className="animate-spin" /> Reading…</> : "Read position"}</Button>
            </form>
            {knownVaults.length > 0 && (
              <div className="flex flex-wrap items-center gap-1 px-3 pb-3 text-[11px] text-muted-foreground">
                <span>Recent:</span>
                {knownVaults.map((v) => (
                  <button key={v} type="button" className={cn("rounded border border-border px-1.5 py-0.5 font-mono hover:bg-secondary", vault?.vaultId === v && "bg-accent text-accent-foreground")} onClick={() => { setVaultInput(v); void loadPosition(v); }} aria-label={`Read vault ${v}`}>
                    {v.slice(0, 8)}…
                  </button>
                ))}
              </div>
            )}
            {loadError && <div className="px-3 pb-3"><Alert variant="destructive"><Info /><AlertTitle>Could not read that vault</AlertTitle><AlertDescription>{loadError}</AlertDescription></Alert></div>}
            {loading && <div className="grid gap-2 border-t border-border p-3 sm:grid-cols-5">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>}
            {vault && balance !== null && (
              <>
                <KpiStrip className="rounded-none border-x-0 border-b-0 sm:grid-cols-3 lg:grid-cols-3">
                  <Kpi label="Shares held" value={formatShares(balance)} sub={`of ${formatShares(vault.sharesOutstanding)} outstanding`} />
                  <Kpi label="NAV / share" value={navNow !== null ? <Tick numeric={navNow}>{formatDropsPerShare(navNow)}</Tick> : "—"} sub={utilisation !== null ? `${formatPercent(utilisation, 0)} of assets on loan` : "drops per share"} />
                  <Kpi label="Accounting value" value={heldValueDrops ? formatXrp(heldValueDrops, 2) : "—"} sub={`vault cash ${formatXrp(vault.assetsAvailableDrops, 2)}`} />
                </KpiStrip>
                {!vault.transferable && (
                  <div className="p-3"><Alert variant="destructive"><Info /><AlertTitle>These shares cannot be transferred</AlertTitle><AlertDescription>The share issuance was created without the transfer flag, so no buyer can receive them. Nothing can be listed.</AlertDescription></Alert></div>
                )}
                {vault.transferable && BigInt(balance) === 0n && (
                  <div className="p-3"><Alert variant="warning"><Info /><AlertTitle>No shares held</AlertTitle><AlertDescription>This wallet holds no units of this vault&apos;s share issuance.</AlertDescription></Alert></div>
                )}
              </>
            )}
            {!vault && !loading && !loadError && <PanelEmpty>Paste the vault&apos;s ledger index or pick a recent one. Your live share balance for that vault is read from the validated ledger.</PanelEmpty>}
          </Panel>

          {vault && (
            <DialogTrigger label="NAV chart" icon={<LineChart />} title="NAV per share" description="Real vault state at past ledgers. Blue when NAV rose over the window, red when it fell." size="xl">
            <Panel
              title="NAV per share"
              actions={<span className="text-[11px] text-muted-foreground">{history.status === "loading" ? "reading history…" : history.first ? `since ledger #${history.first.ledgerIndex.toLocaleString("en-US")}` : ""}{history.status === "error" && <Button variant="ghost" size="sm" className="ml-2 h-6 px-2 text-xs" onClick={() => void history.refresh()}>Retry</Button>}</span>}
              bodyClassName="px-2 pt-2"
            >
              <TimeSeriesChart
                data={chartData}
                series={[{ key: "nav", label: "NAV / share", format: (v) => `${formatDropsPerShare(v)} drops`, area: true }]}
                yFormat={(v) => formatDropsPerShare(v)}
                directional
                height={200}
                emptyLabel={history.status === "error" ? `History unavailable: ${history.error}` : history.status === "loading" ? "Reading vault history from the validated ledger…" : "No history yet"}
              />
              <p className="px-2 pb-2 pt-1 text-[11px] text-muted-foreground">Blue when NAV rose over the window, red when it fell. Owner <code>{shortAddress(vault.owner)}</code> · issuance <code>{vault.shareMptId.slice(0, 12)}…</code></p>
            </Panel>
            </DialogTrigger>
          )}
        </div>

        {/* The ticket. */}
        <div className="min-w-0">
          <Panel title={reviewing ? "Review order" : "Sell ticket"} actions={<span className="text-[11px] text-muted-foreground">{reviewing ? "step 3 of 3" : positionReady ? "step 2 of 3" : "step 1 of 3"}</span>} bodyClassName="space-y-3 p-3">
            {!reviewing ? (
              <>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="shares" className="text-xs">Shares to sell</Label>
                    {balance !== null && <button type="button" className="text-[11px] text-primary hover:underline disabled:text-muted-foreground" disabled={!canSell} onClick={() => setShares(balance)}>All ({formatShares(balance)})</button>}
                  </div>
                  <Input id="shares" inputMode="numeric" className="h-9 font-mono" placeholder="0" value={shares} disabled={!canSell} onChange={(e) => setShares(e.target.value.replace(/[^\d]/g, ""))} aria-invalid={!!errors.shares && shares !== ""} />
                  {errors.shares && shares !== "" && <p className="text-xs text-destructive">{errors.shares}</p>}
                  {quantityValueDrops && <p className="text-[11px] text-muted-foreground">Accounting value of this quantity: <span className="tabular-nums text-foreground">{formatXrp(quantityValueDrops)}</span></p>}
                </div>

                <div className="space-y-1">
                  <Label htmlFor="price" className="text-xs">Total price (XRP)</Label>
                  <Input id="price" inputMode="decimal" className="h-9 font-mono" placeholder="0.000000" value={priceXrp} disabled={!canSell} onChange={(e) => setPriceXrp(e.target.value)} aria-invalid={!!errors.price && priceXrp !== ""} />
                  {errors.price && priceXrp !== "" && <p className="text-xs text-destructive">{errors.price}</p>}
                  <div className="flex flex-wrap gap-1" role="group" aria-label="Quick price">
                    {QUICK_FILLS.map((q) => (
                      <Button key={q.bps} type="button" variant="outline" size="sm" className={cn("h-7 px-2 text-xs tabular-nums", q.bps > 0 && "text-up")} disabled={!quantityValueDrops || !canSell} onClick={() => fill(q.bps)}>{q.label}</Button>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">Quick prices are computed from the accounting value of the quantity above, rounded down to a whole drop.</p>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Expires in</Label>
                  <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Expiry">
                    {EXPIRY_OPTIONS.map((o) => (
                      <Button key={o.hours} type="button" role="radio" aria-checked={expiryHours === o.hours} variant={expiryHours === o.hours ? "default" : "outline"} size="sm" className="h-7 px-2 text-xs" disabled={!canSell} onClick={() => setExpiryHours(o.hours)}>{o.label}</Button>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">Enforced by Raise when the offer is read, not by the ledger.</p>
                </div>

                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-y border-border py-2 text-xs" aria-live="polite">
                  <dt className="text-muted-foreground">Unit price</dt><dd className="text-right tabular-nums">{previewUnit ? `${formatDropsPerShare(previewUnit)} drops/sh` : "—"}</dd>
                  <dt className="text-muted-foreground">Discount to NAV</dt><dd className="text-right"><Delta ratio={previewRatio} /></dd>
                  <dt className="text-muted-foreground">Proceeds</dt><dd className="text-right text-sm font-semibold tabular-nums">{typedPriceDrops ? formatXrp(typedPriceDrops) : "—"}</dd>
                </dl>

                {errors.general.length > 0 && (
                  <Alert variant="destructive"><Info /><AlertTitle>Cannot list this offer</AlertTitle><AlertDescription>{errors.general.map((e) => <p key={e}>{e}</p>)}</AlertDescription></Alert>
                )}
                <Button className="w-full" size="lg" disabled={!review || blocked || !canSell} onClick={() => setReviewing(true)}>Review order</Button>
                <p className="text-[11px] text-muted-foreground">A discount is a price you accept, not a return the buyer earns. The position&apos;s value can change before a buyer settles.</p>
              </>
            ) : review && vault ? (
              <>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
                  <dt className="text-muted-foreground">Sell</dt><dd className="text-right tabular-nums">{formatShares(review.shares)} share units</dd>
                  <dt className="text-muted-foreground">For</dt><dd className="text-right text-sm font-semibold tabular-nums">{formatXrp(review.priceDrops)}</dd>
                  <dt className="text-muted-foreground">Unit price</dt><dd className="text-right tabular-nums">{formatDropsPerShare(review.unitPriceXrp)} drops/sh</dd>
                  <dt className="text-muted-foreground">Accounting value</dt><dd className="text-right tabular-nums">{formatXrp(review.accountingValueDrops)}</dd>
                  <dt className="text-muted-foreground">Discount to NAV</dt><dd className="text-right"><Delta ratio={review.discount} /></dd>
                  <dt className="text-muted-foreground">Expires</dt><dd className="text-right">{new Date(review.expiresAt).toLocaleString("en-GB")}</dd>
                  <dt className="text-muted-foreground">Seller</dt><dd className="text-right font-mono">{shortAddress(address)}</dd>
                  <dt className="text-muted-foreground">Vault</dt><dd className="text-right font-mono">{vault.vaultId.slice(0, 12)}…</dd>
                  <dt className="text-muted-foreground">Network</dt><dd className="text-right tabular-nums">{TRACK1.networkId}</dd>
                </dl>
                <div className="flex flex-wrap items-center gap-2">
                  <DiscountBadge discount={review.discount} />
                </div>
                <p className="text-[11px] text-muted-foreground">Accounting value is the vault&apos;s assets attributed to this quantity, realised interest only (cash basis). The market price is yours to set. Publishing signs a marketplace authorization with your wallet; it does not move XRP or shares. Settlement, when a buyer comes, is one all-or-nothing Batch.</p>
                {publishError && <Alert variant="destructive"><Info /><AlertTitle>Could not publish</AlertTitle><AlertDescription>{publishError}</AlertDescription></Alert>}
                <div className="grid grid-cols-[auto_1fr] gap-2">
                  <Button variant="ghost" disabled={publishing} onClick={() => setReviewing(false)}>Edit</Button>
                  <Button disabled={blocked} onClick={() => void publish()}>{publishing ? "Publishing…" : "Publish offer"}</Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">The terms changed. <Button variant="link" className="h-auto p-0" onClick={() => setReviewing(false)}>Edit the ticket</Button>.</p>
            )}
          </Panel>
          <div className="mt-3">
            <DialogTrigger label="My offers" icon={<ListOrdered />} title="Your offers" description="Shared across browsers. A pending sale needs your approval from this wallet." size="xl">
              <MyOffersTable />
            </DialogTrigger>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DiscountBadge({ discount }: { discount: number | null }) {
  return <ValueBadge value={describeRatio(discount)} verbose />;
}
