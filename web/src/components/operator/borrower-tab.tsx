"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Kpi, KpiStrip, PanelEmpty, Tick } from "@/components/terminal";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { formatXrp, xrpToDrops } from "@/lib/format";
import { readLoan, readLoansFor, signAndSubmit, type LoanState, type Submitted } from "@/lib/ledger";
import { useWallet } from "@/lib/wallet";
import { buildLoanPay, ceilDrops, DEFAULTS, fullRepaymentOfferDrops, isEntryNotFound, loanStatus, sumCeilDrops, type LoanStatus } from "./lending";
import { LoanDetailBody } from "./loan-detail";
import { Badge, ConnectPrompt, Countdown, Field, Mono, Note, StatusBadge, XrpInput, xrp } from "./shared";

const POLL_MS = 15_000;

// The repayment side: what I owe, when the next payment falls due, and a ticket per loan.
export function BorrowerTab() {
  const wallet = useWallet();
  const address = wallet.account?.address ?? null;
  const [loans, setLoans] = React.useState<LoanState[] | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const toast = useToast();
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
      const title = closed ? "Loan closed" : result.resultCode === "tesSUCCESS" ? (after && loanStatus(after.flags, after) === "repaid" ? "Repaid in full" : "Payment applied") : "Payment rejected";
      const note = closed
        ? `The ledger deleted loan ${loan.loanId.slice(0, 8)}… after full repayment. The charge was capped at what was owed plus the close fee.`
        : after ? `Principal outstanding is now ${xrp(after.principalOutstandingDrops)} with ${after.paymentRemaining} payments remaining.` : undefined;
      toast.pushResult(result, title, "generic", note);
    } catch (error) {
      toast.push({ tone: "error", title: "Repayment failed", description: (error as Error).message });
    } finally {
      setBusy(null);
      await Promise.all([load(), wallet.refresh()]);
    }
  };

  if (!address) {
    return (
      <div className="space-y-3">
        <KpiStrip className="sm:grid-cols-3 lg:grid-cols-3">
          {["Loans", "Principal owed", "Next payment due"].map((label) => <Kpi key={label} label={label} value="—" sub="connect a wallet" />)}
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
    <div className="space-y-4">
      {loadError && <Alert variant="destructive"><AlertTitle>Could not read the ledger</AlertTitle><AlertDescription>{loadError}</AlertDescription></Alert>}

      <KpiStrip className="sm:grid-cols-3 lg:grid-cols-3">
        <Kpi label="Loans" value={loans?.length ?? "—"} sub={loans && loans.length > 0 && worst ? <StatusBadge status={worst} /> : lastRead ? `ledger read ${new Date(lastRead).toLocaleTimeString("en-GB")}` : "reading ledger…"} />
        <Kpi label="Principal owed" value={principalOwed === null ? "—" : <Tick numeric={principalOwed}>{formatXrp(principalOwed, 2)}</Tick>} sub={totalOutstanding === null ? "across all loans" : `${formatXrp(totalOutstanding, 2)} with scheduled interest`} />
        <Kpi label="Next payment due" value={Number.isFinite(nextDue) && nextDue > 0 ? <Countdown due={nextDue} /> : "—"} sub="earliest due date" />
      </KpiStrip>

      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">Your loans</h2>
        <Button variant="ghost" size="sm" className="h-7 px-2" aria-label="Re-read the ledger" onClick={() => void load()}><RefreshCw className="size-3.5" /></Button>
      </div>

      {loans === null ? (
        <Skeleton className="h-24" />
      ) : loans.length === 0 ? (
        <div className="terminal-panel"><PanelEmpty>No loan where you are the borrower. Ask an operator to originate one to your address.</PanelEmpty></div>
      ) : (
        <ul className="grid gap-3">
          {loans.map((loan) => <BorrowerLoanCard key={loan.loanId} loan={loan} busy={busy === loan.loanId} onRepay={(amount, full) => void repay(loan, amount, full)} />)}
        </ul>
      )}

      <Note>Interest counts for the vault only once you have paid it. Scheduled interest is what the contract will charge over its life.</Note>
    </div>
  );
}

function BorrowerLoanCard({ loan, busy, onRepay }: { loan: LoanState; busy: boolean; onRepay: (amountDrops: string, full: boolean) => void }) {
  const [open, setOpen] = React.useState<"repay" | "details" | null>(null);
  const status = loanStatus(loan.flags, loan);
  return (
    <li className="terminal-panel p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-semibold">Loan <Mono value={loan.loanId} short={8} className="text-sm" /></span>
        <StatusBadge status={status} />
        <span className="ml-auto text-xs text-muted-foreground">broker <Mono value={loan.loanBrokerId} short={8} /></span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4 text-sm">
        <div><p className="text-[10px] font-semibold uppercase tracking-[.1em] text-muted-foreground">Principal outstanding</p><p className="mt-0.5 font-semibold tabular-nums">{xrp(loan.principalOutstandingDrops)}</p></div>
        <div><p className="text-[10px] font-semibold uppercase tracking-[.1em] text-muted-foreground">Periodic payment</p><p className="mt-0.5 font-semibold tabular-nums">{xrp(loan.periodicPaymentDrops)}</p></div>
        <div><p className="text-[10px] font-semibold uppercase tracking-[.1em] text-muted-foreground">Remaining</p><p className="mt-0.5 font-semibold tabular-nums">{loan.paymentRemaining}</p></div>
        <div><p className="text-[10px] font-semibold uppercase tracking-[.1em] text-muted-foreground">Next due</p><p className="mt-0.5 font-semibold"><Countdown due={loan.nextPaymentDueDate} /></p></div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" disabled={status === "repaid"} onClick={() => setOpen("repay")}>Repay</Button>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setOpen("details")}>Details</Button>
      </div>
      <Dialog open={open === "repay"} onClose={() => setOpen(null)} title="Repay" description="Defaults to one periodic payment. Full early repayment offers everything outstanding plus the close fee; the ledger caps the charge at what is owed." size="sm">
        <RepayTicket loan={loan} busy={busy} onRepay={onRepay} />
      </Dialog>
      <Dialog open={open === "details"} onClose={() => setOpen(null)} title={<span>Loan <Mono value={loan.loanId} short={12} className="text-base" /></span>} description="The schedule is a projection of the contract, not realised interest." size="xl">
        <LoanDetailBody loan={loan} showBorrower={false} />
      </Dialog>
    </li>
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
