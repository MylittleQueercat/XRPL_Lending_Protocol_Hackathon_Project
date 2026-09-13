"use client";
import * as React from "react";
import Link from "next/link";
import { ExternalLink, Info, RefreshCw, ShieldCheck } from "lucide-react";
import { TxResult } from "@/components/tx-result";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Panel } from "@/components/terminal";
import { DialogTrigger } from "@/components/ui/dialog";
import { OfferStatusBadge } from "@/components/market/status-badge";
import type { useOffer } from "@/components/market/use-offers";
import { CancelOfferButton } from "@/components/sell/my-offers";
import { formatShares, formatXrp, shortAddress, shortHash } from "@/lib/format";
import { explorerTx, routes } from "@/lib/network";
import { hasShareHolder, readShareBalance, readVault, signAndSubmit, type Submitted, type VaultState } from "@/lib/ledger";
import { performMarketAction } from "@/lib/market-client";
import { signBuyerSale, signSellerSale } from "@/lib/market-signing";
import type { MarketAction, MarketAttempt } from "@/lib/market-contract";
import { useWallet } from "@/lib/wallet";
import { browserJournal, SUBMISSION_EVENT, SUBMISSION_JOURNAL_KEY } from "@/lib/submission-journal";
import { cn } from "@/lib/utils";
import { rememberVault } from "@/components/position/known-vaults";

const STATUS: Record<MarketAttempt["status"], { title: string; description: string }> = {
  "awaiting-buyer": { title: "Buyer signature needed", description: "The request is saved. The buyer reviews the exact payment and signs from their own browser." },
  "awaiting-seller": { title: "Waiting for seller approval", description: "The buyer signed. The seller opens this same link and approves with their own wallet. Nothing has been submitted yet." },
  submitting: { title: "Submission in progress", description: "The signed transaction is recorded. Check its saved hash for the result. Do not start another payment." },
  pending: { title: "Outcome not confirmed yet", description: "This request survives reloads. A timeout is not a failed payment. Check the saved transaction; no new sale is submitted." },
  settled: { title: "Sale verified", description: "The exact payment and share delivery were verified on the validated ledger." },
  failed: { title: "Attempt needs review", description: "The request remains locked. Review its transaction before arranging another sale. Raise does not reopen or retry it automatically." },
};

// The sale ticket on an offer page. The market snapshot is owned by the page so both share one poll.
export function BuyPanel({ offerId, market, className }: { offerId: string; market: ReturnType<typeof useOffer>; className?: string }) {
  const wallet = useWallet();
  const scope = `${wallet.account?.address ?? "disconnected"}:${offerId}:${market.offer?.shareMptId ?? "loading"}`;
  return <ScopedBuyPanel key={scope} offerId={offerId} wallet={wallet} market={market} className={className} />;
}

function ScopedBuyPanel({ offerId, wallet, market, className }: {
  offerId: string;
  wallet: ReturnType<typeof useWallet>;
  market: ReturnType<typeof useOffer>;
  className?: string;
}) {
  const { offer, attempt } = market;
  const [, setVault] = React.useState<VaultState | null>(null);
  const [live, setLive] = React.useState<{ sellerShares: string; authorized: boolean } | null>(null);
  const [ledgerError, setLedgerError] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const lock = React.useRef(false);
  const [authorization, setAuthorization] = React.useState<Submitted | null>(null);
  const [authorizationBlock, setAuthorizationBlock] = React.useState<string | null>("Checking transaction recovery storage…");
  const mounted = React.useRef(false);
  const generation = React.useRef(0);
  const address = wallet.account?.address;
  const vaultId = offer?.vaultId, issuanceId = offer?.shareMptId, sellerAddress = offer?.seller;
  const refreshAuthorization = React.useCallback(() => {
    let reason: string | null = null;
    try { if (address) browserJournal().assertClear(address); }
    catch (cause) { reason = cause instanceof Error && cause.message ? cause.message : "Transaction recovery storage cannot be read safely."; }
    if (mounted.current) setAuthorizationBlock(reason);
    return reason;
  }, [address]);
  const refreshLedger = React.useCallback(async () => {
    if (!mounted.current) return;
    const current = ++generation.current;
    refreshAuthorization();
    setLedgerError(null); setLive(null);
    if (!vaultId || !issuanceId || !sellerAddress) return;
    try {
      const [nextVault, sellerShares, authorized] = await Promise.all([readVault(vaultId), readShareBalance(sellerAddress, issuanceId), address ? hasShareHolder(address, issuanceId) : Promise.resolve(false)]);
      if (current !== generation.current) return;
      setVault(nextVault); setLive({ sellerShares, authorized });
    } catch (cause) { if (current === generation.current) setLedgerError((cause as Error).message); }
  }, [vaultId, issuanceId, sellerAddress, address, refreshAuthorization]);
  React.useEffect(() => {
    if (address && vaultId) rememberVault(window.localStorage, vaultId);
  }, [address, vaultId]);
  React.useEffect(() => {
    mounted.current = true;
    // Recovery can create the holding. Invalidate its cached state together with
    // the journal so authorization cannot be repeated before the ledger is read.
    const read = () => { void refreshLedger(); };
    const storage = (event: StorageEvent) => { if (event.key === null || event.key === SUBMISSION_JOURNAL_KEY) read(); };
    read();
    window.addEventListener(SUBMISSION_EVENT, read);
    window.addEventListener("storage", storage);
    return () => {
      mounted.current = false;
      generation.current++;
      window.removeEventListener(SUBMISSION_EVENT, read);
      window.removeEventListener("storage", storage);
    };
  }, [refreshLedger]);

  async function act(action: MarketAction | (() => Promise<MarketAction>)) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setActionError(null);
    try { await performMarketAction(typeof action === "function" ? await action() : action, wallet.requireSigner); }
    catch (cause) { setActionError(`${(cause as Error).message} Refresh the saved request before taking another action.`); }
    finally { await market.refresh(); lock.current = false; setBusy(false); }
  }
  async function authorizeHolding() {
    if (!offer || !address || lock.current || refreshAuthorization()) return;
    lock.current = true; setBusy(true); setActionError(null);
    try {
      const signer = await wallet.requireSigner();
      if (!mounted.current) return;
      if (signer.classicAddress !== address) throw new Error("Reconnect the account that requested this authorization.");
      const result = await signAndSubmit({ TransactionType: "MPTokenAuthorize", Account: address, MPTokenIssuanceID: offer.shareMptId } as never, signer);
      if (!mounted.current) return;
      setAuthorization(result);
      await refreshLedger();
    } catch (cause) {
      if (mounted.current) {
        const pending = refreshAuthorization();
        setActionError(`${(cause as Error).message} ${pending ? "Check transaction recovery before signing again." : "No authorization is recorded as pending. You can try again."}`);
      }
    } finally {
      lock.current = false;
      if (mounted.current) { refreshAuthorization(); setBusy(false); }
    }
  }
  if (!market.ready) return <Panel title="Sale ticket" className={className}><div className="space-y-2 p-3"><Skeleton className="h-8" /><Skeleton className="h-24" /><Skeleton className="h-10" /></div></Panel>;
  if (!offer) return <Panel title={market.error ? "Marketplace unavailable" : "Offer not found"} className={className}><div className="space-y-3 p-3 text-sm text-muted-foreground"><p>{market.error ?? "This offer is not present in the shared marketplace."}</p><Button variant="outline" size="sm" onClick={() => void market.refresh()} disabled={market.refreshing}><RefreshCw /> Refresh marketplace</Button></div></Panel>;
  const seller = address === offer.seller, buyer = !!address && address === attempt?.buyer;
  const blocked = busy || !!market.error || !!wallet.networkError || !address;
  const available = live !== null && BigInt(live.sellerShares) >= BigInt(offer.shares);
  const proof = offer.settlement;
  const reservedBuyer = market.snapshot.offers.find((entry) => entry.id === offer.id)?.settlement?.buyer;
  const title = attempt ? STATUS[attempt.status].title : seller ? "Your offer" : "Sale ticket";
  return (
    <Panel title={title} className={className} actions={<OfferStatusBadge state={offer.state} />} bodyClassName="space-y-3 p-3">
      <p className="text-xs text-muted-foreground">{attempt ? STATUS[attempt.status].description : seller ? "A buyer opens this offer with their wallet to request a purchase. You then return here to approve it." : "Two steps: allow your wallet to hold these shares, then request the purchase. The seller approves from their side and the swap settles in one go."}</p>
      {(market.error || actionError || ledgerError) && <Alert variant="warning"><Info /><AlertTitle>Refresh before continuing</AlertTitle><AlertDescription><p>{actionError ?? market.error ?? ledgerError}</p><Button size="sm" variant="outline" disabled={busy || market.refreshing} onClick={() => { void market.refresh(); void refreshLedger(); }}><RefreshCw /> Refresh saved state</Button></AlertDescription></Alert>}
      {proof && offer.state === "settled" && <Alert variant="success"><ShieldCheck /><AlertTitle>Payment and shares verified</AlertTitle><AlertDescription><p>{formatShares(offer.shares)} shares delivered to {shortAddress(proof.buyer)} for {formatXrp(offer.priceDrops)}. Validated ledger #{proof.ledgerIndex.toLocaleString()}.</p><a href={explorerTx(proof.hash)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-xs underline">{shortHash(proof.hash)} <ExternalLink className="size-3" /></a></AlertDescription></Alert>}

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-y border-border py-2 text-xs">
        <dt className="text-muted-foreground">You pay</dt><dd className="text-right text-sm font-semibold tabular-nums">{formatXrp(offer.priceDrops)}</dd>
        <dt className="text-muted-foreground">You receive</dt><dd className="text-right tabular-nums">{formatShares(offer.shares)} shares</dd>
        <dt className="text-muted-foreground">Seller</dt><dd className="text-right font-mono">{shortAddress(offer.seller)}{seller && <span className="ml-1 text-muted-foreground">(you)</span>}</dd>
        <dt className="text-muted-foreground">Seller holds now</dt>
        <dd className={cn("text-right tabular-nums", live && !available && offer.state === "open" && "text-down")}>{live ? `${formatShares(live.sellerShares)} shares` : ledgerError ? "—" : <Skeleton className="ml-auto h-3.5 w-16" />}</dd>
      </dl>

      {!address && offer.state === "open" && <Alert variant="info"><Info /><AlertTitle>Connect your own wallet</AlertTitle><AlertDescription>Buyers sign the payment. Sellers sign the sale. Use the same offer link on separate browsers.</AlertDescription></Alert>}
      {wallet.networkError && <p role="alert" className="text-sm text-destructive">{wallet.networkError}</p>}
      {attempt ? <>
        <dl className="space-y-1.5 text-xs"><div><dt className="text-muted-foreground">Buyer</dt><dd className="font-mono break-all">{attempt.buyer}</dd></div><div><dt className="text-muted-foreground">Request</dt><dd className="font-mono break-all">{attempt.id}</dd></div>{attempt.lastLedgerSequence && <div><dt className="text-muted-foreground">Transaction ledger limit</dt><dd className="tabular-nums">{attempt.lastLedgerSequence.toLocaleString()}</dd></div>}</dl>
        {attempt.message && <p role="status" className="text-sm text-muted-foreground break-words">{attempt.message}</p>}
        {attempt.hash && <a href={explorerTx(attempt.hash)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-mono text-primary">{shortHash(attempt.hash)} <ExternalLink className="size-3" /></a>}
        {attempt.status === "awaiting-buyer" && buyer && <Button className="w-full" disabled={blocked} onClick={() => void act(async () => ({ type: "buyer-sign", offerId, batch: signBuyerSale(offer, attempt, await wallet.requireSigner()) }))}>{busy ? "Saving signature…" : "Sign buyer payment"}</Button>}
        {attempt.status === "awaiting-seller" && seller && <><p className="text-sm">Fee: {typeof attempt.batch?.Fee === "string" ? formatXrp(attempt.batch.Fee) : "Unavailable"}. You receive {formatXrp(offer.priceDrops)} before this fee.</p><Button className="w-full" disabled={blocked} onClick={() => void act(async () => ({ type: "seller-submit", offerId, txBlob: signSellerSale(offer, attempt, await wallet.requireSigner()) }))}>{busy ? "Submitting sale…" : "Approve and submit sale"}</Button></>}
        {attempt.status === "awaiting-seller" && buyer && <p className="text-sm">Share this page URL with the seller. They approve from their own wallet. Keep this request open to see progress.</p>}
        {attempt.status === "awaiting-buyer" && seller && <p className="text-sm">Waiting for the buyer to sign. Their request is saved.</p>}
        {(seller || buyer) && ["pending", "submitting", "failed"].includes(attempt.status) && <Button className="w-full" variant="outline" disabled={blocked} onClick={() => void act({ type: "reconcile", offerId })}><RefreshCw /> {busy ? "Checking transaction…" : "Check recorded transaction"}</Button>}
        {offer.state === "settled" && <Link href={`${routes.portfolio}?vault=${offer.vaultId}`} className={cn(buttonVariants({ variant: "outline" }), "w-full")}>View portfolio</Link>}
      </> : offer.state === "open" ? <>
        {seller ? <>
          <p className="text-sm">This is your offer. Cancelling stops new purchase requests; it does not revoke an already signed Batch.</p>
          <CancelOfferButton offerId={offerId} onDone={market.refresh} size="default" className="[&>button]:flex-1 w-full" />
        </> : <>
          {live && <p className="text-sm">Seller currently holds {formatShares(live.sellerShares)} shares. {available ? "Listed quantity is covered." : "Not enough shares to deliver this offer."}</p>}
          {!!address && live && !live.authorized && <><p className="text-sm">Your wallet must first accept this vault&apos;s shares. One signature, no XRP moves.</p><Button variant="outline" className="w-full" disabled={blocked || !!authorizationBlock} onClick={() => void authorizeHolding()}>{busy ? "Checking authorization…" : "Allow these shares in my wallet"}</Button></>}
          {authorizationBlock && <p role="status" className="text-sm text-muted-foreground">{authorizationBlock} No repeat is sent automatically.</p>}
          {authorization && <TxResult result={authorization} />}
          <Button className="w-full" size="lg" disabled={blocked || !!authorizationBlock || seller || !live?.authorized || !available} onClick={() => void act({ type: "prepare", offerId })}>{busy ? "Preparing request…" : "Request purchase"}</Button>
        </>}
      </> : offer.state === "settling" && !attempt && reservedBuyer === address ? <>
        <p className="text-sm">Your purchase reservation was saved before its unsigned transaction was prepared. You can finish preparing the same request. No signed transaction is rebuilt.</p>
        <Button className="w-full" disabled={blocked} onClick={() => void act({ type: "prepare", offerId })}>{busy ? "Finishing preparation…" : "Finish preparing request"}</Button>
      </> : <p className="text-sm">This offer is {offer.state} and cannot accept a new request.</p>}

      <div className="flex items-center justify-between border-t border-border pt-2 text-[11px] text-muted-foreground">
        <span>Refreshing never sends another payment.</span>
        <DialogTrigger label="Terms" variant="ghost" buttonSize="sm" className="h-6 px-2 text-[11px]" title="What you take on" size="sm">
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>Started requests stay locked through reloads and uncertain results. Expiry does not revoke an already signed transaction. Refreshing does not send another payment.</p>
            <p>A vault share represents proportional exposure to its assets and credit risk. A discount is an agreed price, not promised yield. Future withdrawal depends on repayments and available cash; neither liquidity nor a return is guaranteed.</p>
            <p>The seller pays the outer transaction fee, shown before approval. Both exchange legs are verified against the saved transaction hash and its ledger metadata.</p>
            <p>These are test wallets on network 4001. Seeds stay in each browser session; the shared server receives public data and signatures.</p>
          </div>
        </DialogTrigger>
      </div>
    </Panel>
  );
}
