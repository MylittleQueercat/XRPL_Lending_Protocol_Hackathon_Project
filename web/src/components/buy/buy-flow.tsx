"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, ExternalLink, Info, RefreshCw, ShieldCheck } from "lucide-react";
import type { Wallet } from "xrpl";
import { PageHeader } from "@/components/page-header";
import { Stat } from "@/components/stat";
import { TxResult } from "@/components/tx-result";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPercent, formatShares, formatXrp, shortAddress, shortHash, unitLabel } from "./format-local";
import { explorerAccount, explorerTx, routes } from "@/lib/network";
import { buildSaleBatch, hasShareHolder, readNetworkStatus, readShareBalance, readVault, readXrpBalance, shareValueDrops, signAndSubmit, signAndSubmitSale, type Submitted, type VaultState } from "@/lib/ledger";
import { discountRatio, getOffer, subscribeOffers, transitionOffer, unitPriceDrops, type Offer } from "@/lib/offers";
import { useWallet } from "@/lib/wallet";
import { cn } from "@/lib/utils";
import { assessSettlement, likelyCause, preflight, type Snapshot, type SettlementVerdict } from "./settlement";
import { SnapshotTable } from "./snapshot-table";

type Phase =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "closed"; offer: Offer }
  | { kind: "ready"; offer: Offer; vault: VaultState }
  | { kind: "settling"; offer: Offer; vault: VaultState; before: Snapshot }
  | { kind: "settled"; offer: Offer; vault: VaultState; before: Snapshot; after: Snapshot; result: Submitted; verdict: Extract<SettlementVerdict, { kind: "settled" }> }
  | { kind: "nothing-moved"; offer: Offer; vault: VaultState; before: Snapshot; after: Snapshot; result: Submitted | null }
  | { kind: "partial"; offer: Offer; vault: VaultState; before: Snapshot; after: Snapshot; result: Submitted | null; detail: string }
  | { kind: "unknown"; offer: Offer; vault: VaultState; before: Snapshot; error: string };

interface Live {
  ledgerIndex: number;
  sellerShares: string;
  buyerXrp: string;
  buyerHasHolder: boolean;
}

async function snapshot(buyer: string, seller: string, shareMptId: string): Promise<Snapshot> {
  const [status, buyerShares, sellerShares, buyerXrp, sellerXrp] = await Promise.all([
    readNetworkStatus(),
    readShareBalance(buyer, shareMptId),
    readShareBalance(seller, shareMptId),
    readXrpBalance(buyer),
    readXrpBalance(seller),
  ]);
  return { buyerShares, sellerShares, buyerXrp, sellerXrp, ledgerIndex: status.ledgerIndex };
}

export function BuyFlow({ offerId }: { offerId: string }) {
  const wallet = useWallet();
  const [phase, setPhase] = React.useState<Phase>({ kind: "loading" });
  const [live, setLive] = React.useState<Live | null>(null);
  const [liveError, setLiveError] = React.useState<string | null>(null);
  const [sellerSeed, setSellerSeed] = React.useState("");
  const [authorize, setAuthorize] = React.useState<{ busy: boolean; result: Submitted | null; error: string | null }>({ busy: false, result: null, error: null });
  const [busy, setBusy] = React.useState(false);

  // Offer and vault. The offer store is browser-local; the vault is the ledger.
  const load = React.useCallback(async () => {
    const offer = getOffer(offerId);
    if (!offer) return setPhase({ kind: "missing" });
    if (offer.state !== "open") return setPhase({ kind: "closed", offer });
    try {
      const vault = await readVault(offer.vaultId);
      setPhase((current) => (current.kind === "loading" || current.kind === "ready" || current.kind === "closed" || current.kind === "missing" ? { kind: "ready", offer, vault } : current));
    } catch (cause) {
      setLiveError(`Cannot read the vault from the ledger: ${(cause as Error).message}`);
    }
  }, [offerId]);

  React.useEffect(() => {
    void load();
    return subscribeOffers(() => void load());
  }, [load]);

  // Pre-flight reads. Everything the confirmation depends on is re-read from the validated ledger.
  const refreshLive = React.useCallback(async () => {
    if (phase.kind !== "ready" || !wallet.account) return;
    const { offer } = phase;
    try {
      const [status, sellerShares, buyerXrp, buyerHasHolder] = await Promise.all([
        readNetworkStatus(),
        readShareBalance(offer.seller, offer.shareMptId),
        readXrpBalance(wallet.account.address),
        hasShareHolder(wallet.account.address, offer.shareMptId),
      ]);
      setLive({ ledgerIndex: status.ledgerIndex, sellerShares, buyerXrp, buyerHasHolder });
      setLiveError(null);
    } catch (cause) {
      setLiveError((cause as Error).message);
    }
  }, [phase, wallet.account]);

  React.useEffect(() => {
    void refreshLive();
  }, [refreshLive]);

  const runAuthorize = async () => {
    if (phase.kind !== "ready" || !wallet.account) return;
    setAuthorize({ busy: true, result: null, error: null });
    try {
      const signer = await wallet.requireSigner();
      const result = await signAndSubmit({ TransactionType: "MPTokenAuthorize", Account: wallet.account.address, MPTokenIssuanceID: phase.offer.shareMptId } as never, signer);
      setAuthorize({ busy: false, result, error: null });
      await refreshLive();
    } catch (cause) {
      setAuthorize({ busy: false, result: null, error: (cause as Error).message });
    }
  };

  const settle = async () => {
    if (phase.kind !== "ready" || !wallet.account || !live) return;
    const { offer, vault } = phase;
    const buyerAddress = wallet.account.address;
    setBusy(true);
    let before: Snapshot | null = null;
    try {
      const buyer: Wallet = await wallet.requireSigner();
      const seller: Wallet = wallet.signerForSeed(sellerSeed);
      if (seller.classicAddress !== offer.seller) throw new Error(`That seed belongs to ${shortAddress(seller.classicAddress)}, not to the seller ${shortAddress(offer.seller)}.`);
      before = await snapshot(buyerAddress, offer.seller, offer.shareMptId);
      // Re-check at the last moment: the market moves between render and click.
      const check = preflight({ offerState: getOffer(offer.id)?.state ?? "missing", expiresAt: offer.expiresAt, sellerShares: before.sellerShares, buyerXrp: before.buyerXrp, buyerHasHolder: live.buyerHasHolder, buyerIsSeller: buyerAddress === offer.seller, terms: offer });
      if (!check.ok) throw new Error(check.blockers[0] ?? "Authorise holding these shares first.");
      transitionOffer(offer.id, "settling");
      setPhase({ kind: "settling", offer, vault, before });
      const result = await signAndSubmitSale(buildSaleBatch(offer.seller, buyerAddress, offer.shareMptId, offer.priceDrops, offer.shares), seller, buyer);
      const after = await snapshot(buyerAddress, offer.seller, offer.shareMptId);
      const verdict = assessSettlement(before, after, offer);
      if (verdict.kind === "settled") {
        transitionOffer(offer.id, "settled", { hash: result.hash, ledgerIndex: result.ledgerIndex, buyer: buyerAddress });
        setPhase({ kind: "settled", offer: getOffer(offer.id) ?? offer, vault: await readVault(offer.vaultId), before, after, result, verdict });
      } else if (verdict.kind === "nothing-moved") {
        transitionOffer(offer.id, "open");
        setPhase({ kind: "nothing-moved", offer, vault, before, after, result });
      } else {
        setPhase({ kind: "partial", offer, vault, before, after, result, detail: verdict.detail });
      }
      void wallet.refresh();
    } catch (cause) {
      // Only after the offer moved to settling can the outcome be uncertain; before that nothing was sent.
      if (before && getOffer(offer.id)?.state === "settling") {
        setPhase({ kind: "unknown", offer, vault, before, error: (cause as Error).message });
      } else {
        setLiveError((cause as Error).message);
      }
    } finally {
      setBusy(false);
      setSellerSeed("");
    }
  };

  // After a transport failure the ledger is the only authority. Re-read, never resubmit.
  const recheck = async () => {
    if (phase.kind !== "unknown" || !wallet.account) return;
    setBusy(true);
    try {
      const after = await snapshot(wallet.account.address, phase.offer.seller, phase.offer.shareMptId);
      const verdict = assessSettlement(phase.before, after, phase.offer);
      if (verdict.kind === "settled") {
        setPhase({ kind: "settled", offer: phase.offer, vault: await readVault(phase.offer.vaultId), before: phase.before, after, result: { hash: "", ledgerIndex: 0, resultCode: "tesSUCCESS", validated: true, meta: {} }, verdict });
      } else if (verdict.kind === "nothing-moved") {
        transitionOffer(phase.offer.id, "open");
        setPhase({ kind: "nothing-moved", offer: phase.offer, vault: phase.vault, before: phase.before, after, result: null });
      } else {
        setPhase({ kind: "partial", offer: phase.offer, vault: phase.vault, before: phase.before, after, result: null, detail: verdict.detail });
      }
    } catch (cause) {
      setPhase({ ...phase, error: (cause as Error).message });
    } finally {
      setBusy(false);
    }
  };

  // ------------------------------------------------------------------------------------------

  if (phase.kind === "loading") {
    return (
      <>
        <PageHeader title="Buy shares" />
        <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]"><Skeleton className="h-72" /><Skeleton className="h-72" /></div>
      </>
    );
  }

  if (phase.kind === "missing") {
    return (
      <>
        <PageHeader title="Offer not found" description="This offer does not exist in this browser's market record." />
        <Link href={routes.market} className={cn(buttonVariants({ variant: "outline" }))}>Back to market</Link>
      </>
    );
  }

  if (phase.kind === "closed") {
    const { offer } = phase;
    return (
      <>
        <PageHeader title="Offer no longer open" description={`This offer is ${offer.state}.`} />
        <Card className="max-w-xl">
          <CardContent className="space-y-3">
            {offer.state === "settled" && offer.settlement && (
              <p className="text-sm">
                Settled to <code className="text-xs">{shortAddress(offer.settlement.buyer)}</code> in ledger {offer.settlement.ledgerIndex.toLocaleString("en-US")} ·{" "}
                <a href={explorerTx(offer.settlement.hash)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline">{shortHash(offer.settlement.hash)} <ExternalLink className="size-3" /></a>
              </p>
            )}
            {offer.state === "settling" && <p className="text-sm text-muted-foreground">A settlement is in flight for this offer. If it did not execute, the seller can reopen it.</p>}
            {offer.state === "expired" && <p className="text-sm text-muted-foreground">The seller set an expiry that has passed. Nothing was executed.</p>}
            {offer.state === "cancelled" && <p className="text-sm text-muted-foreground">The seller withdrew this offer. Nothing was executed.</p>}
            <Link href={routes.market} className={cn(buttonVariants({ variant: "outline" }))}>Back to market</Link>
          </CardContent>
        </Card>
      </>
    );
  }

  const { offer, vault } = phase;
  const accountingValue = shareValueDrops(offer.shares, vault);
  const discount = discountRatio(offer.priceDrops, accountingValue);
  const shareOfVault = BigInt(vault.sharesOutstanding) > 0n ? Number(BigInt(offer.shares) * 10_000n / BigInt(vault.sharesOutstanding)) / 10_000 : 0;
  const isSeller = wallet.account?.address === offer.seller;

  if (phase.kind === "settled") {
    return <Settled phase={phase} buyer={wallet.account?.address ?? phase.offer.settlement?.buyer ?? ""} accountingValue={accountingValue} shareOfVault={shareOfVault} />;
  }

  return (
    <>
      <PageHeader
        title="Buy shares"
        description="You are taking over a position in a lending vault. Payment and shares settle in one all-or-nothing transaction, and the result is read back from the ledger before anything is claimed."
        action={<Link href={routes.offer(offer.id)} className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>Offer details</Link>}
      />

      {phase.kind === "nothing-moved" && (
        <div className="mb-6 space-y-4">
          <Alert variant="destructive">
            <ShieldCheck />
            <AlertTitle>Settlement did not execute — nothing moved</AlertTitle>
            <AlertDescription>
              <p>{likelyCause(phase.before, offer)} The all-or-nothing rule held: your XRP and the seller&apos;s shares are exactly where they were. The offer has been reopened.</p>
              {phase.result && <p className="font-mono text-xs">engine result {phase.result.resultCode}{phase.result.ledgerIndex > 0 && <> · <a href={explorerTx(phase.result.hash)} target="_blank" rel="noreferrer" className="text-primary hover:underline">{shortHash(phase.result.hash)}</a></>}</p>}
            </AlertDescription>
          </Alert>
          <Card><CardHeader><CardTitle>Ledger state before and after</CardTitle></CardHeader><CardContent><SnapshotTable before={phase.before} after={phase.after} buyer={wallet.account?.address ?? ""} seller={offer.seller} /></CardContent></Card>
        </div>
      )}

      {phase.kind === "partial" && (
        <div className="mb-6 space-y-4">
          <Alert variant="destructive">
            <ShieldCheck />
            <AlertTitle>Unexpected ledger state — verify manually</AlertTitle>
            <AlertDescription>
              <p>The balances moved in a way that matches neither a completed sale nor an untouched ledger. The offer record has not been changed. Check both accounts in the explorer before doing anything else.</p>
              <p className="font-mono text-xs">{phase.detail}</p>
              {phase.result && phase.result.ledgerIndex > 0 && <a href={explorerTx(phase.result.hash)} target="_blank" rel="noreferrer" className="font-mono text-xs text-primary hover:underline">{shortHash(phase.result.hash)}</a>}
            </AlertDescription>
          </Alert>
          <Card><CardHeader><CardTitle>Ledger state before and after</CardTitle></CardHeader><CardContent><SnapshotTable before={phase.before} after={phase.after} buyer={wallet.account?.address ?? ""} seller={offer.seller} /></CardContent></Card>
        </div>
      )}

      {phase.kind === "unknown" && (
        <Alert variant="warning" className="mb-6">
          <Info />
          <AlertTitle>Outcome unknown</AlertTitle>
          <AlertDescription>
            <p>The connection failed after the transaction was submitted: {phase.error}</p>
            <p>The ledger decides what happened, not this page. Re-read it; the transaction will not be sent again.</p>
            <Button size="sm" variant="outline" onClick={recheck} disabled={busy}><RefreshCw className={busy ? "animate-spin" : ""} /> Re-check ledger</Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>What you get</CardTitle>
              <CardDescription>A share position in vault <code className="text-xs">{shortAddress(vault.vaultId, 8, 6)}</code>, read from ledger #{vault.ledgerIndex.toLocaleString("en-US")}.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              <Stat label="Shares" value={formatShares(offer.shares)} hint={unitLabel} />
              <Stat label="Accounting value" value={formatXrp(accountingValue)} hint="realised interest only, never scheduled" />
              <Stat label="Share of vault" value={formatPercent(shareOfVault, 2)} hint={`${formatXrp(vault.assetsTotalDrops)} total assets`} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>What you pay</CardTitle>
              <CardDescription>To <a href={explorerAccount(offer.seller)} target="_blank" rel="noreferrer" className="font-mono text-xs hover:underline">{shortAddress(offer.seller)}</a>, the current holder.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              <Stat label="Total price" value={formatXrp(offer.priceDrops)} />
              <Stat label="Unit price" value={`${unitPriceDrops(offer)} XRP`} hint="per share unit" />
              <Stat
                label="Against accounting value"
                value={discount === null ? "—" : <span className={discount >= 0 ? "text-success" : "text-warning"}>{discount >= 0 ? "−" : "+"}{formatPercent(Math.abs(discount))}</span>}
                hint={discount === null ? "vault has no assets" : discount >= 0 ? "discount" : "premium"}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>How it settles</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>One <code>Batch</code> transaction with <code>tfAllOrNothing</code>: your payment and the shares move together or not at all. You sign your payment; the seller signs the batch.</p>
              <p>Before anything is reported as a sale, this page re-reads four balances from the validated ledger and requires both legs to have moved by exactly the agreed amounts. An engine result on its own proves nothing here.</p>
              <Separator />
              <p className="font-medium">What you are taking on</p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>The underlying loans continue. Their credit risk is now yours in proportion to your shares.</li>
                <li>A discount is not yield. It is the seller&apos;s price for leaving early.</li>
                <li>Withdrawing later depends on the vault holding enough cash at that moment. The seller is selling precisely because it did not.</li>
                <li>No liquidity, buyer or return is guaranteed, here or anywhere on this protocol.</li>
              </ul>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Pre-flight</CardTitle>
              <CardDescription>{live ? `Ledger #${live.ledgerIndex.toLocaleString("en-US")}` : "Reading the ledger…"}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!wallet.account ? (
                <Alert variant="info"><Info /><AlertTitle>Connect as the buyer</AlertTitle><AlertDescription>Use the wallet button in the header. You will pay from that account.</AlertDescription></Alert>
              ) : isSeller ? (
                <Alert variant="info"><Info /><AlertTitle>This is your offer</AlertTitle><AlertDescription><Link href={routes.sell()} className="text-primary hover:underline">Manage it from the sell screen.</Link></AlertDescription></Alert>
              ) : live ? (
                <PreflightList live={live} offer={offer} buyer={wallet.account.address} />
              ) : (
                <Skeleton className="h-24" />
              )}
              {liveError && <Alert variant="destructive"><AlertTitle>Ledger read failed</AlertTitle><AlertDescription>{liveError}</AlertDescription></Alert>}
              {wallet.account && !isSeller && live && !live.buyerHasHolder && (
                <div className="space-y-2">
                  <Button variant="outline" className="w-full" onClick={runAuthorize} disabled={authorize.busy}>{authorize.busy ? "Submitting…" : "Authorise holding these shares"}</Button>
                  <p className="text-xs text-muted-foreground">The ledger requires a holder object for this share issuance before it can be delivered to you. One transaction, then this check passes.</p>
                  {authorize.result && <TxResult result={authorize.result} />}
                  {authorize.error && <p className="text-xs text-destructive">{authorize.error}</p>}
                </div>
              )}
              <Button variant="ghost" size="sm" onClick={refreshLive} disabled={!wallet.account || busy}><RefreshCw /> Re-read ledger</Button>
            </CardContent>
          </Card>

          {wallet.account && !isSeller && (
            <Card>
              <CardHeader>
                <CardTitle>Confirm</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Alert variant="info">
                  <Info />
                  <AlertTitle>Seller signature</AlertTitle>
                  <AlertDescription>In a product this step is a signing request sent to the seller&apos;s wallet. On this network no wallet can co-sign a Batch, so the demo asks for the seller&apos;s test seed here. It is used once, in this browser, and never stored.</AlertDescription>
                </Alert>
                <div className="space-y-1.5">
                  <Label htmlFor="seller-seed">Seller signing seed (demo only)</Label>
                  <Input id="seller-seed" type="password" autoComplete="off" placeholder="s…" value={sellerSeed} onChange={(e) => setSellerSeed(e.target.value)} disabled={busy || phase.kind !== "ready"} />
                </div>
                <Button
                  className="w-full"
                  size="lg"
                  disabled={busy || phase.kind !== "ready" || !live || !preflight({ offerState: offer.state, expiresAt: offer.expiresAt, sellerShares: live.sellerShares, buyerXrp: live.buyerXrp, buyerHasHolder: live.buyerHasHolder, buyerIsSeller: false, terms: offer }).ok || !sellerSeed}
                  onClick={settle}
                >
                  {busy ? "Settling…" : `Confirm and settle for ${formatXrp(offer.priceDrops)}`} <ArrowRight />
                </Button>
                {phase.kind === "settling" && <p className="text-xs text-muted-foreground">Submitted. Waiting for validation, then re-reading both accounts.</p>}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function PreflightList({ live, offer, buyer }: { live: Live; offer: Offer; buyer: string }) {
  const check = preflight({ offerState: offer.state, expiresAt: offer.expiresAt, sellerShares: live.sellerShares, buyerXrp: live.buyerXrp, buyerHasHolder: live.buyerHasHolder, buyerIsSeller: buyer === offer.seller, terms: offer });
  const items = [
    { ok: offer.state === "open" && Date.parse(offer.expiresAt) > Date.now(), label: "Offer open and unexpired" },
    { ok: BigInt(live.sellerShares) >= BigInt(offer.shares), label: `Seller holds ${formatShares(live.sellerShares)} shares (needs ${formatShares(offer.shares)})` },
    { ok: BigInt(live.buyerXrp) >= BigInt(offer.priceDrops) + 1_000_000n, label: `You hold ${formatXrp(live.buyerXrp)} (needs ${formatXrp(offer.priceDrops)} + 1 XRP margin)` },
    { ok: live.buyerHasHolder, label: "You can hold this share issuance" },
  ];
  return (
    <ul className="space-y-1.5 text-sm">
      {items.map((item) => (
        <li key={item.label} className="flex items-start gap-2">
          <Badge variant={item.ok ? "success" : "destructive"} className="mt-0.5 h-4 min-w-4 px-1">{item.ok ? "✓" : "✕"}</Badge>
          <span className={item.ok ? "" : "text-muted-foreground"}>{item.label}</span>
        </li>
      ))}
      {check.blockers.length > 0 && <li className="pt-1 text-xs text-destructive">{check.blockers[0]}</li>}
    </ul>
  );
}

function Settled({ phase, buyer, accountingValue, shareOfVault }: { phase: Extract<Phase, { kind: "settled" }>; buyer: string; accountingValue: string; shareOfVault: number }) {
  const { offer, vault, before, after, result } = phase;
  return (
    <>
      <PageHeader title="You now hold this position" description="Both legs of the settlement moved by exactly the agreed amounts. This was verified from the ledger, not assumed from the transaction result." />
      <div className="space-y-4">
        {result.hash ? <TxResult result={result} context="sale" title="Sale settled" /> : (
          <Alert variant="success"><ShieldCheck /><AlertTitle>Sale settled</AlertTitle><AlertDescription>Confirmed by re-reading the ledger after a connection failure. Both legs moved as agreed.</AlertDescription></Alert>
        )}
        <Card>
          <CardHeader>
            <CardTitle>Your position</CardTitle>
            <CardDescription>Vault <a href={`${explorerAccount(vault.pseudoAccount)}`} target="_blank" rel="noreferrer" className="font-mono text-xs hover:underline">{shortAddress(vault.vaultId, 8, 6)}</a> · issuance <code className="text-xs">{shortAddress(offer.shareMptId, 8, 6)}</code></CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <Stat label="Shares held now" value={formatShares(after.buyerShares)} hint={`was ${formatShares(before.buyerShares)}`} />
            <Stat label="Accounting value" value={formatXrp(accountingValue)} hint="realised interest only" />
            <Stat label="Share of vault" value={formatPercent(shareOfVault, 2)} hint={`${formatXrp(vault.assetsAvailableDrops)} available cash`} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Proof</CardTitle><CardDescription>Both parties, both assets, before and after.</CardDescription></CardHeader>
          <CardContent><SnapshotTable before={before} after={after} buyer={buyer} seller={offer.seller} /></CardContent>
        </Card>
        <Alert variant="info">
          <Info />
          <AlertTitle>About withdrawing</AlertTitle>
          <AlertDescription>You can redeem these shares for XRP only while the vault holds enough available cash — currently {formatXrp(vault.assetsAvailableDrops)} of {formatXrp(vault.assetsTotalDrops)}. The rest is out on loan. If it is short when you want out, you can list the position here, as the seller just did.</AlertDescription>
        </Alert>
        <div className="flex flex-wrap gap-3">
          <Link href={`${routes.position}?vault=${vault.vaultId}`} className={cn(buttonVariants())}>View my position <ArrowRight /></Link>
          <Link href={routes.market} className={cn(buttonVariants({ variant: "outline" }))}>Back to market</Link>
        </div>
      </div>
    </>
  );
}
