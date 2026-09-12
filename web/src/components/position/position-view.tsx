"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowDownToLine, ArrowUpFromLine, ExternalLink, Info, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Stat } from "@/components/stat";
import { TxResult } from "@/components/tx-result";
import { useWallet } from "@/lib/wallet";
import { formatPercent, formatShares, formatXrp, shortAddress, shortHash, xrpToDrops } from "@/lib/format";
import { explorerAccount, routes } from "@/lib/network";
import {
  readLoansFor,
  readOwnedBrokers,
  readShareBalance,
  readShareHoldings,
  readVault,
  shareValueDrops,
  signAndSubmit, wholeDrops,
  type BrokerState,
  type LoanState,
  type ShareHolding,
  type Submitted,
  type VaultState,
} from "@/lib/ledger";
import { cn } from "@/lib/utils";
import { valuePosition } from "@/lib/accounting";
import { isVaultId, readKnownVaults, rememberVault } from "./known-vaults";
import { LiquidityBar } from "./liquidity-bar";
import { canVaultFund, classifyRefusal, fundableTodayDrops, liquidityPicture, shareOfVault } from "./position-math";
import { VaultSelector } from "./vault-selector";

interface Position {
  vault: VaultState;
  heldUnits: string;
  accountingValueDrops: string;
  readAt: string; // ISO
}

interface Deployed {
  brokers: BrokerState[];
  loans: LoanState[];
  error?: string;
}

interface Refusal {
  requestedDrops: string;
  availableDrops: string;
  accountingValueDrops: string;
  sharesBefore: string;
  sharesAfter: string;
  kind: ReturnType<typeof classifyRefusal>;
}

export function PositionView() {
  const wallet = useWallet();
  const params = useSearchParams();
  const storage = typeof window === "undefined" ? null : window.localStorage;

  const [known, setKnown] = React.useState<string[]>([]);
  const [vaultId, setVaultId] = React.useState<string | null>(null);
  const [position, setPosition] = React.useState<Position | null>(null);
  const [holdings, setHoldings] = React.useState<ShareHolding[]>([]);
  const [deployed, setDeployed] = React.useState<Deployed | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  // Pick up a vault from the URL once, then from the browser's history of looked-up vaults.
  React.useEffect(() => {
    const stored = readKnownVaults(storage);
    const fromUrl = params.get("vault");
    if (fromUrl && isVaultId(fromUrl)) {
      setKnown(rememberVault(storage, fromUrl));
      setVaultId(fromUrl.toUpperCase());
    } else {
      setKnown(stored);
      setVaultId((current) => current ?? stored[0] ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const load = React.useCallback(async () => {
    if (!wallet.account) return;
    setLoading(true);
    setLoadError(null);
    try {
      const all = await readShareHoldings(wallet.account.address);
      setHoldings(all);
      if (vaultId) {
        const vault = await readVault(vaultId);
        const heldUnits = all.find((h) => h.shareMptId === vault.shareMptId)?.amount ?? "0";
        setPosition({ vault, heldUnits, accountingValueDrops: shareValueDrops(heldUnits, vault), readAt: new Date().toISOString() });
        // The loans section is informative only; a failure there must not take the position down.
        try {
          const [brokers, loans] = await Promise.all([readOwnedBrokers(vault.owner), readLoansFor(vault.owner)]);
          setDeployed({ brokers, loans });
        } catch (cause) {
          setDeployed({ brokers: [], loans: [], error: (cause as Error).message });
        }
      } else {
        setPosition(null);
        setDeployed(null);
      }
    } catch (cause) {
      setPosition(null);
      setLoadError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }, [wallet.account, vaultId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const select = (id: string) => {
    setKnown(rememberVault(storage, id));
    setVaultId(id);
  };

  if (!wallet.account) return <NotConnected />;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Vault</CardTitle>
          <CardDescription>Shares are MPTs issued by the vault&apos;s own account. Point the page at a vault to read your holding in it.</CardDescription>
        </CardHeader>
        <CardContent>
          <VaultSelector value={vaultId} known={known} onSelect={select} disabled={loading} />
        </CardContent>
      </Card>

      {loadError && (
        <Alert variant="destructive">
          <Info />
          <AlertTitle>Could not read this vault</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {vaultId && !position && loading && <Skeleton className="h-72 w-full" />}

      {position && (
        <PositionCard position={position} loading={loading} onRefresh={load} account={wallet.account.address} />
      )}

      {position && (
        <div className="grid gap-6 lg:grid-cols-2">
          <DepositCard position={position} onDone={load} />
          <WithdrawCard position={position} onDone={load} account={wallet.account.address} />
        </div>
      )}

      {position && deployed && <DeployedCard vault={position.vault} deployed={deployed} />}

      <HoldingsTable holdings={holdings} activeMptId={position?.vault.shareMptId} loading={loading} />
    </div>
  );
}

function NotConnected() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Connect a wallet to see your position</CardTitle>
        <CardDescription>Use the wallet button in the header. This page will then show, from the validated ledger:</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
          <li>Vault shares you hold and what they are worth on the vault&apos;s books</li>
          <li>Cash actually available in the vault against capital deployed in loans</li>
          <li>Deposit and withdrawal, with the ledger&apos;s own verdict on each</li>
          <li>The route to sell your position when the vault cannot pay you out</li>
        </ul>
      </CardContent>
    </Card>
  );
}

function PositionCard({ position, loading, onRefresh, account }: { position: Position; loading: boolean; onRefresh: () => void; account: string }) {
  const { vault, heldUnits, accountingValueDrops } = position;
  const picture = liquidityPicture(vault.assetsTotalDrops, vault.assetsAvailableDrops);
  const valuation = valuePosition({ assetsTotalDrops: vault.assetsTotalDrops, assetsAvailableDrops: vault.assetsAvailableDrops, lossUnrealizedDrops: vault.lossUnrealizedDrops ?? "0", totalSharesRaw: vault.sharesOutstanding, heldSharesRaw: heldUnits, shareScale: 0 });
  const fundable = valuation.liquidityLimitedWithdrawalEstimateDrops;
  const ownership = shareOfVault(heldUnits, vault.sharesOutstanding);
  const canExitInFull = BigInt(fundable) >= BigInt(valuation.withdrawalValueEstimateDrops) && BigInt(valuation.withdrawalValueEstimateDrops) > 0n;
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>Your position</CardTitle>
          {vault.transferable ? <Badge variant="success">transferable shares</Badge> : <Badge variant="warning">non-transferable shares</Badge>}
          {BigInt(accountingValueDrops) > 0n && (canExitInFull ? <Badge variant="outline">cash covers withdrawal estimate</Badge> : <Badge variant="warning">withdrawal estimate exceeds cash</Badge>)}
        </div>
        <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs">
          <span title={vault.vaultId}>vault {shortHash(vault.vaultId)}</span>
          <span title={vault.shareMptId}>shares {shortHash(vault.shareMptId)}</span>
          <a href={explorerAccount(vault.owner)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
            owner {shortAddress(vault.owner)} <ExternalLink className="size-3" />
          </a>
          <span className="ml-auto">read at ledger {vault.ledgerIndex.toLocaleString("en-US")}</span>
          <Button size="sm" variant="ghost" onClick={onRefresh} disabled={loading} aria-label="Re-read from the ledger">
            <RefreshCw className={cn(loading && "animate-spin")} />
          </Button>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Shares held" value={formatShares(heldUnits)} hint={`${formatPercent(ownership, 2)} of ${formatShares(vault.sharesOutstanding)} outstanding`} />
          <Stat label="Accounting value" value={formatXrp(accountingValueDrops)} hint="Your share of net vault assets after unrealized losses." />
          <Stat label="Vault cash available" value={formatXrp(vault.assetsAvailableDrops)} hint={`of ${formatXrp(vault.assetsTotalDrops)} total assets`} />
          <Stat label="Cash-limited withdrawal estimate" value={formatXrp(fundable)} hint={valuation.soleHolderLossWaiverApplied ? "Sole-holder loss waiver included; execution is not guaranteed." : "Subject to ledger rounding, permissions and later changes."} className={cn(!canExitInFull && BigInt(accountingValueDrops) > 0n && "ring-1 ring-warning/40")} />
        </div>
        <LiquidityBar picture={picture} fundableDrops={fundable} />
        <p className="text-xs text-muted-foreground">
          Estimates use validated ledger reads. Interest is recognized when a payment delivers it; unrealized losses reduce accounting value. These figures are not a guaranteed transaction quote.
          Holder <span className="font-mono">{shortAddress(account)}</span>.
        </p>
      </CardContent>
    </Card>
  );
}

function AmountField({ id, label, value, onChange, disabled, hint }: { id: string; label: string; value: string; onChange: (v: string) => void; disabled?: boolean; hint?: React.ReactNode }) {
  const drops = xrpToDrops(value);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input id={id} inputMode="decimal" placeholder="0.000000" value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={value.length > 0 && !drops} disabled={disabled} className="pr-12 tabular-nums" autoComplete="off" />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">XRP</span>
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function DepositCard({ position, onDone }: { position: Position; onDone: () => Promise<void> }) {
  const wallet = useWallet();
  const [amount, setAmount] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<Submitted | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const drops = xrpToDrops(amount);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!drops) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const signer = await wallet.requireSigner();
      const submitted = await signAndSubmit({ TransactionType: "VaultDeposit", Account: signer.classicAddress, VaultID: position.vault.vaultId, Amount: drops }, signer);
      setResult(submitted);
      // Only the ledger says what changed. Re-read everything before showing new figures.
      await Promise.all([onDone(), wallet.refresh()]);
      if (submitted.resultCode === "tesSUCCESS") setAmount("");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ArrowDownToLine className="size-4 text-primary" /> Deposit</CardTitle>
        <CardDescription>Add XRP to the vault and receive shares at the current accounting price.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-3" onSubmit={submit}>
          <AmountField id="deposit-amount" label="Amount" value={amount} onChange={setAmount} disabled={busy} hint={wallet.balanceDrops ? <>Wallet balance {formatXrp(wallet.balanceDrops)}</> : undefined} />
          <Button type="submit" disabled={!drops || busy || !!wallet.networkError} className="w-full">
            {busy ? "Waiting for validation…" : "Sign and deposit"}
          </Button>
          {wallet.networkError && <p className="text-xs text-destructive">{wallet.networkError}</p>}
          {error && <p className="text-xs text-destructive [overflow-wrap:anywhere]">{error}</p>}
          {result && <TxResult result={result} context="generic" title={result.resultCode === "tesSUCCESS" ? "Deposit validated" : "Deposit rejected"} />}
        </form>
      </CardContent>
    </Card>
  );
}

function WithdrawCard({ position, onDone, account }: { position: Position; onDone: () => Promise<void>; account: string }) {
  const wallet = useWallet();
  const [amount, setAmount] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<Submitted | null>(null);
  const [refusal, setRefusal] = React.useState<Refusal | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const drops = xrpToDrops(amount);
  const { vault, heldUnits, accountingValueDrops } = position;
  const predictedFundable = drops ? canVaultFund(drops, vault.assetsAvailableDrops) : null;
  const picture = liquidityPicture(vault.assetsTotalDrops, vault.assetsAvailableDrops);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!drops) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setRefusal(null);
    try {
      const signer = await wallet.requireSigner();
      // Snapshot the holding first so a refusal can be shown against an unchanged share balance.
      const sharesBefore = await readShareBalance(account, vault.shareMptId);
      const availableBefore = vault.assetsAvailableDrops;
      const submitted = await signAndSubmit({ TransactionType: "VaultWithdraw", Account: signer.classicAddress, VaultID: vault.vaultId, Amount: drops }, signer);
      setResult(submitted);
      const sharesAfter = await readShareBalance(account, vault.shareMptId);
      if (submitted.resultCode !== "tesSUCCESS") {
        setRefusal({ requestedDrops: drops, availableDrops: availableBefore, accountingValueDrops, sharesBefore, sharesAfter, kind: classifyRefusal(submitted.resultCode, drops, accountingValueDrops, availableBefore) });
      } else {
        setAmount("");
      }
      await Promise.all([onDone(), wallet.refresh()]);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ArrowUpFromLine className="size-4 text-primary" /> Withdraw</CardTitle>
        <CardDescription>Redeem shares for XRP. The vault can only pay from cash it actually holds.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-3" onSubmit={submit}>
          <AmountField
            id="withdraw-amount"
            label="Amount"
            value={amount}
            onChange={setAmount}
            disabled={busy}
            hint={
              <>
                Your position is worth {formatXrp(accountingValueDrops)}; the vault holds {formatXrp(vault.assetsAvailableDrops)} in cash.
                {predictedFundable === false && <span className="text-warning-foreground dark:text-warning"> This request exceeds available cash — the ledger will likely refuse it.</span>}
              </>
            }
          />
          {drops && <LiquidityBar picture={picture} requestedDrops={drops} />}
          <Button type="submit" variant={predictedFundable === false ? "outline" : "default"} disabled={!drops || busy || !!wallet.networkError} className="w-full">
            {busy ? "Waiting for validation…" : predictedFundable === false ? "Submit anyway and let the ledger decide" : "Sign and withdraw"}
          </Button>
          {wallet.networkError && <p className="text-xs text-destructive">{wallet.networkError}</p>}
          {error && <p className="text-xs text-destructive [overflow-wrap:anywhere]">{error}</p>}
          {result && <TxResult result={result} context="withdraw" title={result.resultCode === "tesSUCCESS" ? "Withdrawal validated" : "Withdrawal refused"} />}
          {refusal && <RefusalExplainer refusal={refusal} vaultId={vault.vaultId} heldUnits={heldUnits} />}
        </form>
      </CardContent>
    </Card>
  );
}

// The moment the product exists for. It has to be exact about the cause and calm about it.
function RefusalExplainer({ refusal, vaultId, heldUnits }: { refusal: Refusal; vaultId: string; heldUnits: string }) {
  if (refusal.kind === "vault-liquidity") {
    const gap = (BigInt(refusal.requestedDrops) - BigInt(wholeDrops(refusal.availableDrops))).toString();
    return (
      <Alert variant="warning">
        <Info />
        <AlertTitle>The vault can&apos;t fund this today</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>
            You asked for <span className="tabular-nums text-foreground">{formatXrp(refusal.requestedDrops)}</span>. The vault holds <span className="tabular-nums text-foreground">{formatXrp(refusal.availableDrops)}</span> in cash — the other{" "}
            <span className="tabular-nums text-foreground">{formatXrp(gap)}</span> is deployed in loans that are still running.
          </p>
          <p>
            Your shares were not touched: <span className="font-mono tabular-nums text-foreground">{formatShares(refusal.sharesBefore)}</span> before, <span className="font-mono tabular-nums text-foreground">{formatShares(refusal.sharesAfter)}</span> after. This is the vault&apos;s liquidity, not your holding.
          </p>
          <p>You can wait for repayments to bring cash back, or sell the position to another investor now at a price you set.</p>
          <Link href={routes.sell({ vault: vaultId, shares: heldUnits })} className={cn(buttonVariants({ size: "default" }), "mt-1")}>
            Sell this position on Raise
          </Link>
        </AlertDescription>
      </Alert>
    );
  }
  if (refusal.kind === "insufficient-shares") {
    return (
      <Alert variant="destructive">
        <Info />
        <AlertTitle>That is more than your position is worth</AlertTitle>
        <AlertDescription>
          You asked for {formatXrp(refusal.requestedDrops)} but your shares are worth {formatXrp(refusal.accountingValueDrops)} on the vault&apos;s books. This is a holding limit, not a liquidity problem — selling would not change it.
        </AlertDescription>
      </Alert>
    );
  }
  return null;
}

function DeployedCard({ vault, deployed }: { vault: VaultState; deployed: Deployed }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Where the capital is</CardTitle>
        <CardDescription>Brokers and loans run by the vault owner <span className="font-mono">{shortAddress(vault.owner)}</span>. This is what stands between the vault and your cash.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {deployed.error && <p className="text-sm text-muted-foreground">Loan details unavailable right now: {deployed.error}</p>}
        {!deployed.error && deployed.brokers.length === 0 && deployed.loans.length === 0 && <p className="text-sm text-muted-foreground">No brokers or loans found for this vault owner. All assets are held as cash.</p>}
        {deployed.brokers.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow><TableHead>Broker</TableHead><TableHead>Vault</TableHead><TableHead className="text-right">Debt outstanding</TableHead><TableHead className="text-right">First-loss cover</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {deployed.brokers.map((b) => (
                <TableRow key={b.loanBrokerId}>
                  <TableCell className="font-mono" title={b.loanBrokerId}>{shortHash(b.loanBrokerId)}</TableCell>
                  <TableCell className="font-mono" title={b.vaultId}>{b.vaultId === vault.vaultId ? <Badge variant="outline">this vault</Badge> : shortHash(b.vaultId)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatXrp(b.debtTotalDrops)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatXrp(b.coverAvailableDrops)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {deployed.loans.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow><TableHead>Loan</TableHead><TableHead>Borrower</TableHead><TableHead className="text-right">Principal outstanding</TableHead><TableHead className="text-right">Payments left</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {deployed.loans.map((l) => (
                <TableRow key={l.loanId}>
                  <TableCell className="font-mono" title={l.loanId}>{shortHash(l.loanId)}</TableCell>
                  <TableCell className="font-mono">{shortAddress(l.borrower)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatXrp(l.principalOutstandingDrops.split(".")[0])}</TableCell>
                  <TableCell className="text-right tabular-nums">{l.paymentRemaining}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function HoldingsTable({ holdings, activeMptId, loading }: { holdings: ShareHolding[]; activeMptId?: string; loading: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>All MPT holdings on this account</CardTitle>
        <CardDescription>Every issuance the account holds, unfiltered. Vault shares appear here alongside anything else.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading && holdings.length === 0 ? (
          <Skeleton className="h-16 w-full" />
        ) : holdings.length === 0 ? (
          <p className="text-sm text-muted-foreground">No MPT holdings. Depositing into a vault creates one.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow><TableHead>Issuance</TableHead><TableHead className="text-right">Units</TableHead><TableHead /></TableRow>
            </TableHeader>
            <TableBody>
              {holdings.map((h) => (
                <TableRow key={h.shareMptId} data-state={h.shareMptId === activeMptId ? "selected" : undefined}>
                  <TableCell className="font-mono text-xs" title={h.shareMptId}>{h.shareMptId}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatShares(h.amount)}</TableCell>
                  <TableCell className="text-right">{h.shareMptId === activeMptId && <Badge variant="outline">selected vault</Badge>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
