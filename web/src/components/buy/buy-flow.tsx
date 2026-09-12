"use client";
import * as React from "react";
import Link from "next/link";
import { ExternalLink, Info, RefreshCw, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Stat } from "@/components/stat";
import { TxResult } from "@/components/tx-result";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useOffer } from "@/components/market/use-offers";
import { formatShares, formatXrp, shortAddress, shortHash } from "@/lib/format";
import { explorerTx, routes } from "@/lib/network";
import { hasShareHolder, readShareBalance, readVault, estimateShareValueDrops, signAndSubmit, type Submitted, type VaultState } from "@/lib/ledger";
import { unitPriceDrops } from "@/lib/offers";
import { performMarketAction } from "@/lib/market-client";
import { signBuyerSale, signSellerSale } from "@/lib/market-signing";
import type { MarketAction, MarketAttempt } from "@/lib/market-contract";
import { useWallet } from "@/lib/wallet";
import { cn } from "@/lib/utils";

const STATUS: Record<MarketAttempt["status"], { title: string; description: string }> = {
  "awaiting-buyer": { title: "Buyer signature needed", description: "The request is saved. The buyer reviews the exact payment and signs from their own browser." },
  "awaiting-seller": { title: "Waiting for seller approval", description: "The buyer signed. The seller opens this same link and approves with their own wallet. Nothing has been submitted yet." },
  submitting: { title: "Submission in progress", description: "The signed transaction is recorded. Check its saved hash for the result. Do not start another payment." },
  pending: { title: "Outcome not confirmed yet", description: "This request survives reloads. A timeout is not a failed payment. Check the saved transaction; no new sale is submitted." },
  settled: { title: "Sale verified", description: "The exact payment and share delivery were verified on the validated ledger." },
  failed: { title: "Attempt needs review", description: "The request remains locked. Review its transaction before arranging another sale. Raise does not reopen or retry it automatically." },
};

export function BuyFlow({ offerId }: { offerId: string }) {
  const wallet = useWallet();
  const market = useOffer(offerId);
  const { offer, attempt } = market;
  const [vault, setVault] = React.useState<VaultState | null>(null);
  const [live, setLive] = React.useState<{ sellerShares: string; authorized: boolean } | null>(null);
  const [ledgerError, setLedgerError] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const lock = React.useRef(false);
  const [authorization, setAuthorization] = React.useState<Submitted | null>(null);
  const [authorizationUnknown, setAuthorizationUnknown] = React.useState(false);
  const generation = React.useRef(0);
  const address = wallet.account?.address;
  const vaultId = offer?.vaultId, issuanceId = offer?.shareMptId, sellerAddress = offer?.seller;
  const refreshLedger = React.useCallback(async () => {
    const current = ++generation.current;
    setLedgerError(null); setLive(null);
    if (!vaultId || !issuanceId || !sellerAddress) return;
    try {
      const [nextVault, sellerShares, authorized] = await Promise.all([readVault(vaultId), readShareBalance(sellerAddress, issuanceId), address ? hasShareHolder(address, issuanceId) : Promise.resolve(false)]);
      if (current !== generation.current) return;
      setVault(nextVault); setLive({ sellerShares, authorized });
      if (authorized) setAuthorizationUnknown(false);
    } catch (cause) { if (current === generation.current) setLedgerError((cause as Error).message); }
  }, [vaultId, issuanceId, sellerAddress, address]);
  React.useEffect(() => { void refreshLedger(); return () => { generation.current++; }; }, [refreshLedger]);

  async function act(action: MarketAction | (() => Promise<MarketAction>)) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setActionError(null);
    try { await performMarketAction(typeof action === "function" ? await action() : action, wallet.requireSigner); }
    catch (cause) { setActionError(`${(cause as Error).message} Refresh the saved request before taking another action.`); }
    finally { await market.refresh(); lock.current = false; setBusy(false); }
  }
  async function authorizeHolding() {
    if (!offer || lock.current) return;
    lock.current = true; setBusy(true); setActionError(null);
    try {
      const signer = await wallet.requireSigner();
      setAuthorization(await signAndSubmit({ TransactionType: "MPTokenAuthorize", Account: signer.classicAddress, MPTokenIssuanceID: offer.shareMptId } as never, signer));
      await refreshLedger();
    } catch (cause) { setAuthorizationUnknown(true); setActionError(`${(cause as Error).message} Authorization may have been submitted. Re-check your holding before signing again.`); }
    finally { lock.current = false; setBusy(false); }
  }
  if (!market.ready) return <><PageHeader title="Buy shares" /><div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-72" /><Skeleton className="h-72" /></div></>;
  if (!offer) return <><PageHeader title={market.error ? "Marketplace unavailable" : "Offer not found"} description={market.error ?? "This offer is not present in the shared marketplace."} /><Button variant="outline" onClick={() => void market.refresh()} disabled={market.refreshing}><RefreshCw /> Refresh marketplace</Button></>;
  const seller = address === offer.seller, buyer = !!address && address === attempt?.buyer;
  const blocked = busy || !!market.error || !!wallet.networkError || !address;
  const available = live !== null && BigInt(live.sellerShares) >= BigInt(offer.shares);
  const proof = offer.settlement;
  const accountingValue = vault ? estimateShareValueDrops(offer.shares, vault) : null;
  const reservedBuyer = market.snapshot.offers.find((entry) => entry.id === offer.id)?.settlement?.buyer;
  return <>
    <PageHeader title={seller ? "Review share sale" : "Buy shares"} description="Each party approves from their own wallet. Payment and shares settle together in one all-or-nothing Batch." action={<Link href={routes.offer(offer.id)} className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>Offer details</Link>} />
    {(market.error || actionError || ledgerError) && <Alert variant="warning" className="mb-4"><Info /><AlertTitle>Refresh before continuing</AlertTitle><AlertDescription><p>{actionError ?? market.error ?? ledgerError}</p><Button size="sm" variant="outline" disabled={busy || market.refreshing} onClick={() => { void market.refresh(); void refreshLedger(); }}><RefreshCw /> Refresh saved state</Button></AlertDescription></Alert>}
    {proof && offer.state === "settled" && <Alert variant="success" className="mb-4"><ShieldCheck /><AlertTitle>Payment and shares verified</AlertTitle><AlertDescription><p>{formatShares(offer.shares)} raw share units delivered to {shortAddress(proof.buyer)} for {formatXrp(offer.priceDrops)}. Validated ledger #{proof.ledgerIndex.toLocaleString()}.</p><a href={explorerTx(proof.hash)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-xs underline">{shortHash(proof.hash)} <ExternalLink className="size-3" /></a></AlertDescription></Alert>}
    <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
      <div className="space-y-4 min-w-0">
        <Card><CardHeader><CardTitle>Position and price</CardTitle><CardDescription>Seller {shortAddress(offer.seller)}. The underlying loans continue unchanged.</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">
          <Stat label="Shares" value={formatShares(offer.shares)} hint="raw units of this share issuance" /><Stat label="Total price" value={formatXrp(offer.priceDrops)} />
          <Stat label="Unit price" value={unitPriceDrops(offer)} hint="drops per raw share unit" /><Stat label="Accounting value" value={accountingValue !== null ? formatXrp(accountingValue) : "Unavailable"} hint="estimate, not guaranteed redemption" />
        </CardContent></Card>
        <Card><CardHeader><CardTitle>What you take on</CardTitle></CardHeader><CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>A vault share represents proportional exposure to its assets and credit risk. A discount is an agreed price, not promised yield.</p><p>Future withdrawal depends on repayments and available cash. Neither liquidity nor a return is guaranteed.</p>
          <p>The seller pays the outer transaction fee, shown before approval. Both exchange legs are verified against the saved transaction hash and its ledger metadata.</p>
          <p>These are test wallets on network 4001. Seeds stay in each browser session; the shared server receives public data and signatures.</p>
        </CardContent></Card>
      </div>
      <Card className="min-w-0"><CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle>{attempt ? STATUS[attempt.status].title : "Purchase request"}</CardTitle><Badge variant={offer.state === "settled" ? "success" : "outline"}>{offer.state}</Badge></div><CardDescription>{attempt ? STATUS[attempt.status].description : "Authorize receiving these shares, then request the seller’s approval."}</CardDescription></CardHeader><CardContent className="space-y-4">
        {!address && <Alert variant="info"><Info /><AlertTitle>Connect your own wallet</AlertTitle><AlertDescription>Buyers sign the payment. Sellers sign the sale. Use the same offer link on separate browsers.</AlertDescription></Alert>}
        {wallet.networkError && <p role="alert" className="text-sm text-destructive">{wallet.networkError}</p>}
        {attempt ? <>
          <dl className="space-y-2 text-sm"><div><dt className="text-muted-foreground">Buyer</dt><dd className="font-mono break-all text-xs">{attempt.buyer}</dd></div><div><dt className="text-muted-foreground">Request</dt><dd className="font-mono break-all text-xs">{attempt.id}</dd></div>{attempt.lastLedgerSequence && <div><dt className="text-muted-foreground">Transaction ledger limit</dt><dd>{attempt.lastLedgerSequence.toLocaleString()}</dd></div>}</dl>
          {attempt.message && <p role="status" className="text-sm text-muted-foreground break-words">{attempt.message}</p>}
          {attempt.hash && <a href={explorerTx(attempt.hash)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-mono text-primary">{shortHash(attempt.hash)} <ExternalLink className="size-3" /></a>}
          {attempt.status === "awaiting-buyer" && buyer && <Button className="w-full" disabled={blocked} onClick={() => void act(async () => ({ type: "buyer-sign", offerId, batch: signBuyerSale(offer, attempt, await wallet.requireSigner()) }))}>{busy ? "Saving signature…" : "Sign buyer payment"}</Button>}
          {attempt.status === "awaiting-seller" && seller && <><p className="text-sm">Fee: {typeof attempt.batch?.Fee === "string" ? formatXrp(attempt.batch.Fee) : "Unavailable"}. You receive {formatXrp(offer.priceDrops)} before this fee.</p><Button className="w-full" disabled={blocked} onClick={() => void act(async () => ({ type: "seller-submit", offerId, txBlob: signSellerSale(offer, attempt, await wallet.requireSigner()) }))}>{busy ? "Submitting sale…" : "Approve and submit sale"}</Button></>}
          {attempt.status === "awaiting-seller" && buyer && <p className="text-sm">Share this page URL with the seller. They approve from their own wallet. Keep this request open to see progress.</p>}
          {attempt.status === "awaiting-buyer" && seller && <p className="text-sm">Waiting for the buyer to sign. Their request is saved.</p>}
          {(seller || buyer) && ["pending", "submitting", "failed"].includes(attempt.status) && <Button className="w-full" variant="outline" disabled={blocked} onClick={() => void act({ type: "reconcile", offerId })}><RefreshCw /> {busy ? "Checking transaction…" : "Check recorded transaction"}</Button>}
          {offer.state === "settled" && <Link href={`${routes.position}?vault=${offer.vaultId}`} className={cn(buttonVariants({ variant: "outline" }), "w-full")}>View position</Link>}
        </> : offer.state === "open" ? <>
          {seller ? <p className="text-sm">This is your offer. A buyer opens this link with their wallet to request a purchase. You then return here to approve it.</p> : <>
            {live && <p className="text-sm">Seller currently holds {formatShares(live.sellerShares)} raw share units. {available ? "Listed quantity is covered." : "Not enough shares to deliver this offer."}</p>}
            {!!address && live && !live.authorized && <><p className="text-sm">Authorize your account to receive this issuance before requesting the purchase.</p><Button variant="outline" className="w-full" disabled={blocked || authorizationUnknown} onClick={() => void authorizeHolding()}>{busy ? "Checking authorization…" : "Authorize receiving shares"}</Button></>}
            {authorizationUnknown && <p role="status" className="text-sm text-muted-foreground">Authorization outcome is uncertain. Refresh saved state to check your holding. No repeat is sent automatically.</p>}
            {authorization && <TxResult result={authorization} />}
            <Button className="w-full" disabled={blocked || seller || !live?.authorized || !available} onClick={() => void act({ type: "prepare", offerId })}>{busy ? "Preparing request…" : "Request purchase"}</Button>
          </>}
        </> : offer.state === "settling" && !attempt && reservedBuyer === address ? <>
          <p className="text-sm">Your purchase reservation was saved before its unsigned transaction was prepared. You can finish preparing the same request. No signed transaction is rebuilt.</p>
          <Button className="w-full" disabled={blocked} onClick={() => void act({ type: "prepare", offerId })}>{busy ? "Finishing preparation…" : "Finish preparing request"}</Button>
        </> : <p className="text-sm">This offer is {offer.state} and cannot accept a new request.</p>}
        <p className="text-xs text-muted-foreground">Started requests stay locked through reloads and uncertain results. Expiry does not revoke an already signed transaction. Refreshing does not send another payment.</p>
      </CardContent></Card>
    </div>
  </>;
}
