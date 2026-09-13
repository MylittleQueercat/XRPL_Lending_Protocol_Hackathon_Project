"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowDownToLine, ArrowUpFromLine, Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tick } from "@/components/terminal";
import { TxResult } from "@/components/tx-result";
import { useWallet } from "@/lib/wallet";
import { formatShares, formatXrp, xrpToDrops } from "@/lib/format";
import { routes } from "@/lib/network";
import { readShareBalance, signAndSubmit, wholeDrops, type Submitted } from "@/lib/ledger";
import { cn } from "@/lib/utils";
import { LiquidityBar } from "@/components/position/liquidity-bar";
import { canVaultFund, classifyRefusal, liquidityPicture } from "@/components/position/position-math";
import { fractionOfDropsAsXrpInput, type Position } from "./portfolio-math";

interface Refusal {
  requestedDrops: string;
  availableDrops: string;
  accountingValueDrops: string;
  sharesBefore: string;
  sharesAfter: string;
  kind: ReturnType<typeof classifyRefusal>;
}

const QUICK = [25, 50, 100] as const;

function AmountField({ id, value, onChange, disabled, baseDrops, baseLabel }: { id: string; value: string; onChange: (v: string) => void; disabled?: boolean; baseDrops: string | null; baseLabel: string }) {
  const drops = xrpToDrops(value);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-[10px] font-semibold uppercase tracking-[.08em] text-muted-foreground">Amount</label>
        <span role="group" aria-label={`Quick amounts, share of ${baseLabel}`} className="flex gap-1">
          {QUICK.map((pct) => (
            <button key={pct} type="button" disabled={disabled || !baseDrops || BigInt(baseDrops) === 0n} onClick={() => onChange(fractionOfDropsAsXrpInput(baseDrops, pct))} className="h-5 rounded border border-border px-1.5 text-[10px] font-medium tabular-nums text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-40">
              {pct} %
            </button>
          ))}
        </span>
      </div>
      <div className="relative">
        <Input id={id} inputMode="decimal" placeholder="0.000000" value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={value.length > 0 && !drops} disabled={disabled} className="h-10 pr-12 text-right font-mono text-base tabular-nums" autoComplete="off" />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">XRP</span>
      </div>
    </div>
  );
}

function Verdict({ tone, children }: { tone: "up" | "down" | "flat"; children: React.ReactNode }) {
  return (
    <p className={cn("flex items-start gap-1.5 text-xs", tone === "up" && "tick-up", tone === "down" && "tick-down", tone === "flat" && "text-muted-foreground")}>
      <span className={cn("mt-1.5 inline-block size-1.5 shrink-0 rounded-full", tone === "up" ? "bg-up" : tone === "down" ? "bg-down" : "bg-muted-foreground/50")} aria-hidden />
      <span>{children}</span>
    </p>
  );
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium tabular-nums">{children}</span>
    </div>
  );
}

export function DepositForm({ position, afterTransaction }: { position: Position; afterTransaction: () => Promise<void> }) {
  const wallet = useWallet();
  const [amount, setAmount] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<Submitted | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const drops = xrpToDrops(amount);
  const exceedsBalance = drops !== null && wallet.balanceDrops !== null && BigInt(drops) > BigInt(wallet.balanceDrops);

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
      await Promise.all([afterTransaction(), wallet.refresh()]);
      if (submitted.resultCode === "tesSUCCESS") setAmount("");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="space-y-3 p-3" onSubmit={submit}>
      <AmountField id="ticket-deposit" value={amount} onChange={setAmount} disabled={busy} baseDrops={wallet.balanceDrops} baseLabel="wallet balance" />
      <div className="space-y-1 rounded-md border border-border bg-background/60 px-2.5 py-2">
        <Line label="Wallet balance">{wallet.balanceDrops ? <Tick numeric={wallet.balanceDrops}>{formatXrp(wallet.balanceDrops)}</Tick> : "—"}</Line>
        <Line label="Vault NAV / share">{position.navPerShare.toFixed(6)} drops</Line>
        <Line label="You hold">{formatShares(position.heldUnits)} sh</Line>
      </div>
      {drops && (exceedsBalance ? <Verdict tone="down">Exceeds the wallet balance; the ledger will refuse it.</Verdict> : <Verdict tone="up">Funded from the wallet. Shares are issued at the vault&apos;s current NAV; the reserve and fee stay with your account.</Verdict>)}
      <Button type="submit" disabled={!drops || busy || !!wallet.networkError} className="w-full">
        <ArrowDownToLine /> {busy ? "Waiting for validation…" : "Sign and deposit"}
      </Button>
      <p className="text-[11px] leading-4 text-muted-foreground">Its loan broker manages lending; a loan interest rate is not a guaranteed return on your deposit.</p>
      {wallet.networkError && <p className="text-xs text-destructive">{wallet.networkError}</p>}
      {error && <p className="text-xs text-destructive [overflow-wrap:anywhere]">{error}</p>}
      {result && <TxResult result={result} context="generic" title={result.resultCode === "tesSUCCESS" ? "Deposit validated" : "Deposit rejected"} />}
    </form>
  );
}

export function WithdrawForm({ position, account, afterTransaction }: { position: Position; account: string; afterTransaction: () => Promise<void> }) {
  const wallet = useWallet();
  const [amount, setAmount] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<Submitted | null>(null);
  const [refusal, setRefusal] = React.useState<Refusal | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const drops = xrpToDrops(amount);
  const { vault, heldUnits, accountingValueDrops, withdrawableTodayDrops } = position;
  const predictedFundable = drops ? canVaultFund(drops, vault.assetsAvailableDrops) : null;
  const exceedsValue = drops !== null && BigInt(drops) > BigInt(position.withdrawalValueEstimateDrops || "0");
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
      await Promise.all([afterTransaction(), wallet.refresh()]);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="space-y-3 p-3" onSubmit={submit}>
      <AmountField id="ticket-withdraw" value={amount} onChange={setAmount} disabled={busy} baseDrops={withdrawableTodayDrops} baseLabel="withdrawable today" />
      <div className="space-y-1 rounded-md border border-border bg-background/60 px-2.5 py-2">
        <Line label="Position value">{formatXrp(accountingValueDrops)}</Line>
        <Line label="Vault cash"><Tick numeric={vault.assetsAvailableDrops.split(".")[0]}>{formatXrp(vault.assetsAvailableDrops)}</Tick></Line>
        <Line label="Withdrawable today"><Tick numeric={withdrawableTodayDrops}>{formatXrp(withdrawableTodayDrops)}</Tick></Line>
      </div>
      {drops && (
        exceedsValue ? <Verdict tone="down">More than your position is worth on the vault&apos;s books. This is a holding limit, not liquidity.</Verdict>
          : predictedFundable === false ? <Verdict tone="down">Exceeds available cash — the ledger will likely refuse it. You can still submit and let it decide, or sell instead.</Verdict>
            : <Verdict tone="up">Vault cash covers this request at the last read. The ledger has the final word.</Verdict>
      )}
      <LiquidityBar picture={picture} fundableDrops={withdrawableTodayDrops} requestedDrops={drops ?? undefined} />
      <Button type="submit" variant={predictedFundable === false ? "outline" : "default"} disabled={!drops || busy || !!wallet.networkError} className="w-full">
        <ArrowUpFromLine /> {busy ? "Waiting for validation…" : predictedFundable === false ? "Submit anyway, let the ledger decide" : "Sign and withdraw"}
      </Button>
      <p className="text-[11px] leading-4 text-muted-foreground">
        Estimates use validated ledger reads. Interest is recognized when a payment delivers it; unrealized losses reduce accounting value. These figures are not a guaranteed transaction quote.
        {position.soleHolderLossWaiverApplied && " Sole-holder loss waiver included; execution is not guaranteed."}
      </p>
      {wallet.networkError && <p className="text-xs text-destructive">{wallet.networkError}</p>}
      {error && <p className="text-xs text-destructive [overflow-wrap:anywhere]">{error}</p>}
      {result && <TxResult result={result} context="withdraw" title={result.resultCode === "tesSUCCESS" ? "Withdrawal validated" : "Withdrawal refused"} />}
      {refusal && <RefusalExplainer refusal={refusal} vaultId={vault.vaultId} heldUnits={heldUnits} />}
    </form>
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
            You asked for <span className="tabular-nums text-foreground">{formatXrp(refusal.requestedDrops)}</span>. The vault holds <span className="tabular-nums text-foreground">{formatXrp(refusal.availableDrops)}</span> in cash, leaving a shortfall of{" "}
            <span className="tabular-nums tick-down">{formatXrp(gap)}</span>. Some capital may be deployed in outstanding loans.
          </p>
          <p>
            Your shares were not touched: <span className="font-mono tabular-nums text-foreground">{formatShares(refusal.sharesBefore)}</span> before, <span className="font-mono tabular-nums text-foreground">{formatShares(refusal.sharesAfter)}</span> after. This is the vault&apos;s liquidity, not your holding.
          </p>
          <p>You can wait for repayments to bring cash back, or list the position at a price you set and wait for an interested buyer.</p>
          <Link href={routes.sell({ vault: vaultId, shares: heldUnits })} className={cn(buttonVariants({ size: "sm" }), "mt-1")}>
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
