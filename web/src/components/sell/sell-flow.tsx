"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, Info, Wallet as WalletIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ValueBadge } from "@/components/value-badge";
import { describeRatio } from "@/lib/pricing";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Stat } from "@/components/stat";
import { useWallet } from "@/lib/wallet";
import { createOffer, type Offer } from "@/lib/offers";
import { readShareBalance, readVault, type VaultState } from "@/lib/ledger";
import { formatPercent, formatShares, formatXrp, shortAddress } from "@/lib/format";
import { TRACK1, routes } from "@/lib/network";
import { cn } from "@/lib/utils";
import { EXPIRY_OPTIONS, computeReview, isVaultId, readKnownVaults, rememberVault, type Review } from "./review";

type Step = 1 | 2 | 3;
const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: "Position" },
  { n: 2, label: "Terms" },
  { n: 3, label: "Review" },
];

export function SellFlow() {
  const params = useSearchParams();
  const wallet = useWallet();
  const address = wallet.account?.address ?? null;

  const [step, setStep] = React.useState<Step>(1);
  const [vaultInput, setVaultInput] = React.useState(params.get("vault") ?? "");
  const [knownVaults, setKnownVaults] = React.useState<string[]>([]);
  const [vault, setVault] = React.useState<VaultState | null>(null);
  const [balance, setBalance] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const [shares, setShares] = React.useState(params.get("shares") ?? "");
  const [priceXrp, setPriceXrp] = React.useState("");
  const [expiryHours, setExpiryHours] = React.useState<number>(24);

  const [published, setPublished] = React.useState<Offer | null>(null);
  const [publishError, setPublishError] = React.useState<string | null>(null);

  React.useEffect(() => setKnownVaults(readKnownVaults()), []);

  const loadPosition = React.useCallback(async () => {
    if (!address || !isVaultId(vaultInput)) return;
    setLoading(true);
    setLoadError(null);
    setVault(null);
    setBalance(null);
    try {
      const id = vaultInput.trim().toUpperCase();
      const v = await readVault(id);
      const held = await readShareBalance(address, v.shareMptId);
      setVault(v);
      setBalance(held);
      setKnownVaults(rememberVault(id));
    } catch (cause) {
      setLoadError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }, [address, vaultInput]);

  // Prefilled from the position screen: load immediately once a wallet is connected.
  const prefilled = params.get("vault");
  React.useEffect(() => {
    if (prefilled && address && isVaultId(prefilled) && !vault && !loading) void loadPosition();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefilled, address]);

  const { errors, review } = React.useMemo(() => {
    if (!vault || !address || balance === null) return { errors: { general: [] as string[] }, review: null as Review | null };
    return computeReview({ shares, priceXrp, expiryHours }, { vault, seller: address, balance, networkId: TRACK1.networkId });
  }, [vault, address, balance, shares, priceXrp, expiryHours]);

  const canProceedFromPosition = !!vault && balance !== null && BigInt(balance) > 0n && vault.transferable;
  const blocked = !!wallet.networkError;

  const publish = () => {
    if (!review || !vault || !address) return;
    setPublishError(null);
    try {
      const offer = createOffer({
        network: TRACK1.networkId,
        vaultId: vault.vaultId,
        shareMptId: vault.shareMptId,
        seller: address,
        shares: review.shares,
        priceDrops: review.priceDrops,
        expiresAt: review.expiresAt,
      });
      setPublished(offer);
      setShares("");
      setPriceXrp("");
      setExpiryHours(24);
      setStep(1);
    } catch (cause) {
      setPublishError((cause as Error).message);
    }
  };

  if (!address) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><WalletIcon className="size-4 text-primary" /> Connect a wallet to sell</CardTitle>
          <CardDescription>
            Selling transfers your vault-share position to another investor at a price you set; the buyer pays you and takes over the exposure.
            The underlying loans continue unchanged, and the sale settles all-or-nothing on the ledger.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">Use the wallet button in the header. Creating an offer does not sign anything; settlement does.</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {published && (
        <Alert variant="success">
          <CheckCircle2 />
          <AlertTitle>Offer published</AlertTitle>
          <AlertDescription>
            <p>
              {formatShares(published.shares)} units for {formatXrp(published.priceDrops)}.{" "}
              <Link href={routes.offer(published.id)} className="font-medium text-primary hover:underline">View the offer</Link>.
            </p>
            <p>Offers live in this browser for now; expiry and cancellation are enforced by Raise, not by the ledger. Ownership is verified on the ledger at settlement.</p>
          </AlertDescription>
        </Alert>
      )}

      {blocked && (
        <Alert variant="destructive">
          <Info />
          <AlertTitle>Offers are paused</AlertTitle>
          <AlertDescription>{wallet.networkError}</AlertDescription>
        </Alert>
      )}

      <StepIndicator step={step} />

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Which position are you selling?</CardTitle>
            <CardDescription>Paste the vault&apos;s ledger index. Your live share balance for that vault is read from the validated ledger.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form
              className="flex flex-col gap-2 sm:flex-row"
              onSubmit={(e) => {
                e.preventDefault();
                void loadPosition();
              }}
            >
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="vault">Vault ID</Label>
                <Input id="vault" list="known-vaults" className="font-mono" placeholder="64-character hex ledger index" value={vaultInput} onChange={(e) => setVaultInput(e.target.value)} spellCheck={false} autoComplete="off" />
                <datalist id="known-vaults">{knownVaults.map((v) => <option key={v} value={v} />)}</datalist>
              </div>
              <div className="sm:self-end">
                <Button type="submit" variant="outline" disabled={!isVaultId(vaultInput) || loading}>{loading ? "Reading…" : "Read position"}</Button>
              </div>
            </form>

            {loading && <div className="grid gap-3 sm:grid-cols-3"><Skeleton className="h-16" /><Skeleton className="h-16" /><Skeleton className="h-16" /></div>}
            {loadError && <Alert variant="destructive"><Info /><AlertTitle>Could not read that vault</AlertTitle><AlertDescription>{loadError}</AlertDescription></Alert>}

            {vault && balance !== null && (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Stat label="Your shares" value={formatShares(balance)} hint={`of ${formatShares(vault.sharesOutstanding)} outstanding`} />
                  <Stat label="Vault assets" value={formatXrp(vault.assetsTotalDrops)} hint={`${formatXrp(vault.assetsAvailableDrops)} available`} />
                  <Stat label="Owner" value={<span className="font-mono text-base">{shortAddress(vault.owner)}</span>} hint={<span className="font-mono">{vault.shareMptId.slice(0, 12)}…</span>} />
                </div>
                {!vault.transferable && (
                  <Alert variant="destructive"><Info /><AlertTitle>These shares cannot be transferred</AlertTitle><AlertDescription>The share issuance was created without the transfer flag, so no buyer can receive them. Nothing can be listed.</AlertDescription></Alert>
                )}
                {vault.transferable && BigInt(balance) === 0n && (
                  <Alert variant="warning"><Info /><AlertTitle>No shares held</AlertTitle><AlertDescription>This wallet holds no units of this vault&apos;s share issuance.</AlertDescription></Alert>
                )}
              </>
            )}

            <div className="flex justify-end">
              <Button disabled={!canProceedFromPosition || blocked} onClick={() => setStep(2)}>Set terms <ArrowRight /></Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && vault && balance !== null && (
        <Card>
          <CardHeader>
            <CardTitle>Terms</CardTitle>
            <CardDescription>You hold {formatShares(balance)} units. Quantities are whole units; the price is the total for the whole quantity.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="shares">Shares to sell</Label>
                <div className="flex gap-2">
                  <Input id="shares" inputMode="numeric" className="font-mono" value={shares} onChange={(e) => setShares(e.target.value.replace(/[^\d]/g, ""))} aria-invalid={!!errors.shares && shares !== ""} />
                  <Button type="button" variant="outline" onClick={() => setShares(balance)}>Sell all</Button>
                </div>
                {errors.shares && shares !== "" && <p className="text-xs text-destructive">{errors.shares}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="price">Total price (XRP)</Label>
                <Input id="price" inputMode="decimal" className="font-mono" placeholder="0.000000" value={priceXrp} onChange={(e) => setPriceXrp(e.target.value)} aria-invalid={!!errors.price && priceXrp !== ""} />
                {errors.price && priceXrp !== "" && <p className="text-xs text-destructive">{errors.price}</p>}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Expires in</Label>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Expiry">
                {EXPIRY_OPTIONS.map((o) => (
                  <Button key={o.hours} type="button" role="radio" aria-checked={expiryHours === o.hours} variant={expiryHours === o.hours ? "default" : "outline"} size="sm" onClick={() => setExpiryHours(o.hours)}>{o.label}</Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Expiry is enforced by Raise when the offer is read, not by the ledger.</p>
            </div>
            {errors.general.length > 0 && (
              <Alert variant="destructive"><Info /><AlertTitle>Cannot list this offer</AlertTitle><AlertDescription>{errors.general.map((e) => <p key={e}>{e}</p>)}</AlertDescription></Alert>
            )}
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(1)}><ArrowLeft /> Back</Button>
              <Button disabled={!review || blocked} onClick={() => setStep(3)}>Review <ArrowRight /></Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && vault && review && (
        <Card>
          <CardHeader>
            <CardTitle>Review before publishing</CardTitle>
            <CardDescription>Accounting value is the vault&apos;s assets attributed to this quantity, realised interest only. The market price is yours to set.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Shares" value={formatShares(review.shares)} />
              <Stat label="Total price" value={formatXrp(review.priceDrops)} />
              <Stat label="Unit price" value={<span className="font-mono">{review.unitPriceXrp}</span>} hint="XRP per unit" />
              <Stat label="Accounting value" value={formatXrp(review.accountingValueDrops)} hint={`for ${formatShares(review.shares)} units`} />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <DiscountBadge discount={review.discount} />
              <p className="text-sm text-muted-foreground">A discount is a price you accept, not a return the buyer earns. The position&apos;s value can change.</p>
            </div>
            <div className="rounded-lg bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground">
              Expires {new Date(review.expiresAt).toLocaleString("en-GB")}. Seller <span className="font-mono">{shortAddress(address)}</span>. Vault <span className="font-mono">{vault.vaultId.slice(0, 12)}…</span>. Network {TRACK1.networkId}.
            </div>
            {publishError && <Alert variant="destructive"><Info /><AlertTitle>Could not publish</AlertTitle><AlertDescription>{publishError}</AlertDescription></Alert>}
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(2)}><ArrowLeft /> Back</Button>
              <Button disabled={blocked} onClick={publish}>Publish offer</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StepIndicator({ step }: { step: Step }) {
  return (
    <ol className="flex items-center gap-3 text-sm" aria-label="Progress">
      {STEPS.map((s, i) => (
        <li key={s.n} className="flex items-center gap-3">
          <span className={cn("grid size-6 place-items-center rounded-full text-xs font-medium tabular-nums", s.n === step ? "bg-primary text-primary-foreground" : s.n < step ? "bg-success/15 text-success" : "bg-muted text-muted-foreground")}>{s.n}</span>
          <span className={cn(s.n === step ? "font-medium" : "text-muted-foreground")}>{s.label}</span>
          {i < STEPS.length - 1 && <span className="h-px w-6 bg-border" aria-hidden />}
        </li>
      ))}
    </ol>
  );
}

export function DiscountBadge({ discount }: { discount: number | null }) {
  return <ValueBadge value={describeRatio(discount)} verbose />;
}
