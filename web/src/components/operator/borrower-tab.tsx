"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Kpi, KpiStrip, Panel, PanelEmpty, Tick } from "@/components/terminal";
import { TxResult } from "@/components/tx-result";
import { formatXrp, xrpToDrops } from "@/lib/format";
import { readLoan, readLoansFor, signAndSubmit, type LoanState, type Submitted } from "@/lib/ledger";
import { useWallet } from "@/lib/wallet";
import { buildLoanPay, ceilDrops, DEFAULTS, fullRepaymentOfferDrops, isEntryNotFound, loanStatus, sumCeilDrops, type LoanStatus } from "./lending";
import { LoanDetailBody } from "./loan-detail";
import { Badge, ConnectPrompt, Countdown, Field, Mono, Note, StatusBadge, XrpInput, xrp } from "./shared";

const POLL_MS = 15_000;

interface RepayOutcome {
  loanId: string;
  result: Submitted;
  closed: boolean;
  after?: LoanState;
}

// The repayment side: what I owe, when the next payment falls due, and a ticket per loan.
export function BorrowerTab() {
  const wallet = useWallet();
  const address = wallet.account?.address ?? null;
  const [loans, setLoans] = React.useState<LoanState[] | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [outcome, setOutcome] = React.useState<RepayOutcome | { error: string } | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [lastRead, setLastRead] = React.useState<number | null>(null);
  const loading = React.useRef(false);

  const load = React.useCallback(async () => {
    if (!address || loading.current) return;
    loading.current = true;
    setLoadError(null);
    try {
      setLoans((await readLoansFor(address)).filter((l) => l.borrower === address));
      setLastRead(Date.now());
    } catch (error) {
      setLoadError((error as Error).message);
    } finally {
      loading.current = false;
    }
  }, [address]);

  React.useEffect(() => {
    setLoans(null);
    void load();
  }, [load]);

  React.useEffect(() => {
    if (!address) return;
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [address, load]);

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

  if (!address) {
    return (
      <div className="space-y-3">
        <KpiStrip className="lg:grid-cols-4">
          {["Loans", "Principal owed", "Next payment due", "Total value outstanding"].map((label) => <Kpi key={label} label={label} value="—" sub="connect a wallet" />)}
        </KpiStrip>
        <div className="terminal-panel p-6"><ConnectPrompt role="borrower" /></div>
      </div>
    );
  }

  const principalOwed = loans ? sumCeilDrops(loans.map((l) => l.principalOutstandingDrops)) : null;
  const totalOutstanding = loans ? sumCeilDrops(loans.map((l) => l.totalValueOutstandingDrops)) : null;
  const nextDue = loans && loans.length > 0 ? Math.min(...loans.filter((l) => l.nextPaymentDueDate > 0).map((l) => l.nextPaymentDueDate)) : 0;
  const worst = loans?.map((l) => loanStatus(l.flags, l)).reduce<LoanStatus>((acc, s) => s === "defaulted" || acc === "defaulted" ? "defaulted" : s === "impaired" || acc === "impaired" ? "impaired" : s === "performing" || acc === "performing" ? "performing" : "repaid", "repaid");

  return (
    <div className="space-y-3">
      {loadError && <Alert variant="destructive"><AlertTitle>Could not read the ledger</AlertTitle><AlertDescription>{loadError}</AlertDescription></Alert>}

      <KpiStrip className="lg:grid-cols-4">
        <Kpi label="Loans" value={loans?.length ?? "—"} sub={loans && loans.length > 0 && worst ? <StatusBadge status={worst} /> : lastRead ? `ledger read ${new Date(lastRead).toLocaleTimeString("en-GB")}` : "reading ledger…"} />
        <Kpi label="Principal owed" value={principalOwed === null ? "—" : <Tick numeric={principalOwed}>{formatXrp(principalOwed, 2)}</Tick>} sub="across all loans" />
        <Kpi label="Next payment due" value={Number.isFinite(nextDue) && nextDue > 0 ? <Countdown due={nextDue} /> : "—"} sub="earliest due date" />
        <Kpi label="Total value outstanding" value={totalOutstanding === null ? "—" : <Tick numeric={totalOutstanding}>{formatXrp(totalOutstanding, 2)}</Tick>} sub="principal + scheduled interest" />
      </KpiStrip>

      {outcome && "error" in outcome && <Alert variant="destructive"><AlertTitle>Repayment failed</AlertTitle><AlertDescription>{outcome.error}</AlertDescription></Alert>}
      {outcome && "result" in outcome && (
        <div className="space-y-2">
          <TxResult result={outcome.result} title={outcome.closed ? "Loan closed" : outcome.result.resultCode === "tesSUCCESS" ? (outcome.after && loanStatus(outcome.after.flags, outcome.after) === "repaid" ? "Repaid in full" : "Payment applied") : "Payment rejected"} />
          {outcome.closed && <Note className="text-sm">The ledger deleted loan <Mono value={outcome.loanId} /> after full repayment. The charge was capped at principal plus interest accrued to date plus the close fee, whatever amount was offered.</Note>}
          {outcome.after && <Note className="text-sm">Principal outstanding is now {xrp(outcome.after.principalOutstandingDrops)} with {outcome.after.paymentRemaining} payments remaining.</Note>}
        </div>
      )}

      <Panel
        title={<span>Your loans{loans && <span className="ml-1.5 rounded-full bg-secondary px-1.5 text-[10px] tabular-nums">{loans.length}</span>}</span>}
        actions={<Button variant="ghost" size="sm" className="h-7 px-2" aria-label="Re-read the ledger" onClick={() => void load()}><RefreshCw className="size-3.5" /></Button>}
      >
        <div className="border-b border-border px-3 py-2">
          <Note>Cash-basis accounting: interest reaches the vault only when a payment delivers it. Scheduled interest is what the contract will charge over its life, not what the vault has earned.</Note>
        </div>
        {loans === null ? (
          <div className="space-y-2 p-3"><Skeleton className="h-40" /></div>
        ) : loans.length === 0 ? (
          <PanelEmpty>No loan where you are the borrower. Ask an operator to originate one to your address.</PanelEmpty>
        ) : null}
      </Panel>

      {loans?.map((loan) => (
        <Panel key={loan.loanId} title={<span>Loan <Mono value={loan.loanId} short={12} className="normal-case tracking-normal" /></span>} actions={<StatusBadge status={loanStatus(loan.flags, loan)} />}>
          <div className="grid lg:grid-cols-[minmax(0,1fr)_20rem]">
            <LoanDetailBody loan={loan} showBorrower={false} />
            <div className="border-t border-border lg:border-l lg:border-t-0">
              <RepayTicket loan={loan} busy={busy === loan.loanId} onRepay={(amount, full) => void repay(loan, amount, full)} />
            </div>
          </div>
        </Panel>
      ))}
    </div>
  );
}

function RepayTicket({ loan, busy, onRepay }: { loan: LoanState; busy: boolean; onRepay: (amountDrops: string, full: boolean) => void }) {
  const [full, setFull] = React.useState(false);
  const [closeFee, setCloseFee] = React.useState(DEFAULTS.closePaymentFeeXrp);
  const periodic = ceilDrops(loan.periodicPaymentDrops);
  const [amount, setAmount] = React.useState(() => (Number(periodic) / 1e6).toString());

  const closeFeeDrops = xrpToDrops(closeFee) ?? "0";
  const fullOffer = fullRepaymentOfferDrops(loan.totalValueOutstandingDrops, closeFeeDrops);
  const amountDrops = full ? fullOffer : xrpToDrops(amount);

  return (
    <form className="space-y-3 p-3" onSubmit={(e) => { e.preventDefault(); if (amountDrops) onRepay(amountDrops, full); }}>
      <p className="text-[10px] font-semibold uppercase tracking-[.1em] text-muted-foreground">Repay</p>
      <Field id={`amount-${loan.loanId}`} label={full ? "Offered for full repayment" : "Payment amount"} hint={full ? "Outstanding value plus the close fee. The ledger caps the charge at what is actually owed, so offering more is safe." : "Defaults to one periodic payment."}>
        {full ? (
          <div className="flex h-8 items-center rounded-md border border-input bg-background px-2.5 text-sm tabular-nums dark:bg-transparent">{formatXrp(fullOffer)}</div>
        ) : (
          <XrpInput id={`amount-${loan.loanId}`} value={amount} onChange={setAmount} invalid={amount.length > 0 && !amountDrops} />
        )}
      </Field>
      <Field id={`close-fee-${loan.loanId}`} label="Close payment fee" hint="Set at origination; not readable from the Loan object, so enter what the broker set.">
        <XrpInput id={`close-fee-${loan.loanId}`} value={closeFee} onChange={setCloseFee} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={full} onChange={(e) => setFull(e.target.checked)} className="size-4 accent-primary" />
        Full early repayment
      </label>
      {full && <Badge variant="secondary">tfLoanFullPayment</Badge>}
      <Button type="submit" size="sm" className="w-full" disabled={!amountDrops || busy}>{busy ? "Paying…" : full ? "Repay in full" : "Pay"}</Button>
    </form>
  );
}
