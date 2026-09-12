"use client";

import * as React from "react";
import { Info, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Stat } from "@/components/stat";
import { TxResult } from "@/components/tx-result";
import { formatXrp, xrpToDrops } from "@/lib/format";
import { readLoan, readLoansFor, rippleTimeToDate, signAndSubmit, type LoanState, type Submitted } from "@/lib/ledger";
import { useWallet } from "@/lib/wallet";
import { buildLoanPay, ceilDrops, DEFAULTS, formatDuration, fullRepaymentOfferDrops, isEntryNotFound, tenthBpsToPercent } from "./lending";
import { ConnectPrompt, EmptyState, Field, LoanFlags, Mono, XrpInput } from "./shared";

const xrp = (value: string) => formatXrp(ceilDrops(value));

interface RepayOutcome {
  loanId: string;
  result: Submitted;
  closed: boolean;
  after?: LoanState;
}

export function BorrowerTab() {
  const wallet = useWallet();
  const address = wallet.account?.address ?? null;
  const [loans, setLoans] = React.useState<LoanState[] | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [outcome, setOutcome] = React.useState<RepayOutcome | { error: string } | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!address) return;
    setLoadError(null);
    try {
      setLoans((await readLoansFor(address)).filter((l) => l.borrower === address));
    } catch (error) {
      setLoadError((error as Error).message);
    }
  }, [address]);

  React.useEffect(() => {
    setLoans(null);
    void load();
  }, [load]);

  const repay = async (loan: LoanState, amountDrops: string, full: boolean) => {
    if (!address) return;
    setBusy(loan.loanId);
    try {
      const signer = await wallet.requireSigner();
      const result = await signAndSubmit(buildLoanPay(address, loan.loanId, amountDrops, full), signer);
      // The loan object is deleted once fully repaid; not finding it is the success signal.
      let closed = false;
      let after: LoanState | undefined;
      if (result.resultCode === "tesSUCCESS") {
        try {
          after = await readLoan(loan.loanId);
        } catch (error) {
          if (isEntryNotFound(error)) closed = true;
          else throw error;
        }
      }
      setOutcome({ loanId: loan.loanId, result, closed, after });
    } catch (error) {
      setOutcome({ error: (error as Error).message });
    } finally {
      setBusy(null);
      await Promise.all([load(), wallet.refresh()]);
    }
  };

  if (!address) return <ConnectPrompt role="borrower" />;

  return (
    <div className="space-y-6">
      {loadError && <Alert variant="destructive"><AlertTitle>Could not read the ledger</AlertTitle><AlertDescription>{loadError}</AlertDescription></Alert>}

      {outcome && "error" in outcome && <Alert variant="destructive"><AlertTitle>Repayment failed</AlertTitle><AlertDescription>{outcome.error}</AlertDescription></Alert>}
      {outcome && "result" in outcome && (
        <div className="space-y-2">
          <TxResult result={outcome.result} title={outcome.closed ? "Loan closed" : outcome.result.resultCode === "tesSUCCESS" ? "Payment applied" : "Payment rejected"} />
          {outcome.closed && <p className="text-sm text-muted-foreground">The ledger deleted loan <Mono value={outcome.loanId} /> after full repayment. The charge was capped at principal plus interest accrued to date plus the close fee, whatever amount was offered.</p>}
          {outcome.after && <p className="text-sm text-muted-foreground">Principal outstanding is now {xrp(outcome.after.principalOutstandingDrops)} with {outcome.after.paymentRemaining} payments remaining.</p>}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Your loans</CardTitle>
          <CardDescription>Loans where you are the borrower. Figures come from the validated ledger.</CardDescription>
          <CardAction><Button variant="ghost" size="icon" aria-label="Refresh" onClick={() => void load()}><RefreshCw /></Button></CardAction>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="info">
            <Info />
            <AlertTitle>How interest is recognised here</AlertTitle>
            <AlertDescription>This network runs cash-basis accounting: interest reaches the vault only when a payment delivers it. Scheduled interest below is what the contract will charge over its life, not what the vault has earned.</AlertDescription>
          </Alert>
          {loans === null ? <Skeleton className="h-40" /> : loans.length === 0 ? <EmptyState>No loan where you are the borrower. Ask an operator to originate one to your address.</EmptyState> : (
            <div className="space-y-4">
              {loans.map((loan) => <LoanCard key={loan.loanId} loan={loan} busy={busy === loan.loanId} onRepay={(amount, full) => void repay(loan, amount, full)} />)}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function LoanCard({ loan, busy, onRepay }: { loan: LoanState; busy: boolean; onRepay: (amountDrops: string, full: boolean) => void }) {
  const [full, setFull] = React.useState(false);
  const [closeFee, setCloseFee] = React.useState(DEFAULTS.closePaymentFeeXrp);
  const periodic = ceilDrops(loan.periodicPaymentDrops);
  const [amount, setAmount] = React.useState(() => (Number(periodic) / 1e6).toString());

  const closeFeeDrops = xrpToDrops(closeFee) ?? "0";
  const fullOffer = fullRepaymentOfferDrops(loan.totalValueOutstandingDrops, closeFeeDrops);
  const amountDrops = full ? fullOffer : xrpToDrops(amount);

  return (
    <div className="rounded-lg border p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2"><Mono value={loan.loanId} short={12} /><LoanFlags flags={loan.flags} /></div>
        <span className="text-xs text-muted-foreground">Broker <Mono value={loan.loanBrokerId} short={12} /></span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Principal outstanding" value={xrp(loan.principalOutstandingDrops)} />
        <Stat label="Scheduled interest remaining" value={xrp(loan.scheduledInterestRemainingDrops)} hint={`${tenthBpsToPercent(loan.interestRate)} annualised`} />
        <Stat label="Total value outstanding" value={xrp(loan.totalValueOutstandingDrops)} />
        <Stat label="Periodic payment" value={xrp(loan.periodicPaymentDrops)} hint={`${loan.paymentRemaining} remaining, every ${formatDuration(loan.paymentInterval)}`} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Next payment due {loan.nextPaymentDueDate ? rippleTimeToDate(loan.nextPaymentDueDate).toLocaleString("en-GB") : "—"} · grace {formatDuration(loan.gracePeriod)}
      </p>

      <form className="mt-4 grid gap-3 rounded-lg bg-muted/40 p-3 sm:grid-cols-[1fr_1fr_auto]" onSubmit={(e) => { e.preventDefault(); if (amountDrops) onRepay(amountDrops, full); }}>
        <Field id={`amount-${loan.loanId}`} label={full ? "Offered for full repayment" : "Payment amount"} hint={full ? "Outstanding value plus the close fee. The ledger caps the charge at what is actually owed, so offering more is safe." : "Defaults to one periodic payment."}>
          {full ? (
            <div className="flex h-9 items-center rounded-lg border border-input bg-background px-3 text-sm tabular-nums dark:bg-input/30">{formatXrp(fullOffer)}</div>
          ) : (
            <XrpInput id={`amount-${loan.loanId}`} value={amount} onChange={setAmount} />
          )}
        </Field>
        <Field id={`close-fee-${loan.loanId}`} label="Close payment fee" hint="Set at origination; not readable from the Loan object, so enter what the broker set.">
          <XrpInput id={`close-fee-${loan.loanId}`} value={closeFee} onChange={setCloseFee} />
        </Field>
        <div className="flex flex-col justify-end gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={full} onChange={(e) => setFull(e.target.checked)} className="size-4 accent-primary" />
            Full early repayment
          </label>
          <Button type="submit" disabled={!amountDrops || busy}>{busy ? "Paying…" : full ? "Repay in full" : "Pay"}</Button>
        </div>
      </form>
      {full && <Badge variant="secondary" className="mt-2">tfLoanFullPayment</Badge>}
    </div>
  );
}
