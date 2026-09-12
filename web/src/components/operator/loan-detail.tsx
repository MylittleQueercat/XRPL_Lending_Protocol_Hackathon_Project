"use client";

import * as React from "react";
import { Panel, Tick } from "@/components/terminal";
import { BarsChart, chartColor, dropsToXrpNumber, formatXrpAxis } from "@/components/charts";
import type { LoanState } from "@/lib/ledger";
import { rippleTimeToDate } from "@/lib/ledger";
import { cn } from "@/lib/utils";
import { buildPaymentSchedule, formatDuration, loanStatus, paymentsMade, periodRate, scheduleTotals, tenthBpsToPercent } from "./lending";
import { AddressLink, Countdown, Figure, Mono, Note, ProgressBar, StatusBadge, xrp } from "./shared";

const fmtXrp = (v: number) => `${v.toLocaleString("en-US", { maximumFractionDigits: 6 })} XRP`;

// Everything the ledger says about one loan, plus a clearly labelled projection of what the
// contract still calls for. Used by the operator desk and the borrower tab.
export function LoanDetailBody({ loan, showBorrower = true }: { loan: LoanState; showBorrower?: boolean }) {
  const status = loanStatus(loan.flags, loan);
  const made = paymentsMade(loan);
  const total = made + loan.paymentRemaining;
  const schedule = React.useMemo(() => buildPaymentSchedule(loan), [loan]);
  const totals = React.useMemo(() => scheduleTotals(schedule), [schedule]);
  // Due dates label the axis only when they are readable as dates; short test intervals fall back to period numbers.
  const byDueDate = schedule.length > 0 && schedule.length <= 12 && loan.paymentInterval >= 86_400;
  const data = schedule.map((p) => ({
    period: byDueDate ? rippleTimeToDate(p.dueDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : `#${p.period}`,
    principal: dropsToXrpNumber(p.principalDrops),
    interest: dropsToXrpNumber(p.interestDrops),
  }));
  const rate = periodRate(loan.interestRate, loan.paymentInterval);
  const graceEnd = loan.nextPaymentDueDate ? loan.nextPaymentDueDate + loan.gracePeriod : 0;

  return (
    <div className="space-y-3 p-3">
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3 lg:grid-cols-6">
        <Figure label="Principal outstanding" value={<Tick numeric={loan.principalOutstandingDrops}>{xrp(loan.principalOutstandingDrops)}</Tick>} />
        <Figure label="Total value outstanding" value={<Tick numeric={loan.totalValueOutstandingDrops}>{xrp(loan.totalValueOutstandingDrops)}</Tick>} sub="principal + scheduled interest" />
        <Figure label="Scheduled interest remaining" value={xrp(loan.scheduledInterestRemainingDrops)} sub="not yet earned by the vault" />
        <Figure label="Periodic payment" value={xrp(loan.periodicPaymentDrops)} sub={`every ${formatDuration(loan.paymentInterval)}`} />
        <Figure label="Interest rate" value={tenthBpsToPercent(loan.interestRate)} sub={`${(rate * 100).toFixed(3)} % per period`} />
        {showBorrower ? <Figure label="Borrower" value={<AddressLink address={loan.borrower} />} sub={<span>broker <Mono value={loan.loanBrokerId} short={8} /></span>} /> : <Figure label="Broker" value={<Mono value={loan.loanBrokerId} short={10} />} />}
      </div>

      <div className="grid gap-3 rounded-md bg-secondary/50 p-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[.1em] text-muted-foreground">Next payment due</p>
          <p className="mt-0.5 text-xl font-semibold"><Countdown due={loan.nextPaymentDueDate} /></p>
          <Note>
            {loan.nextPaymentDueDate ? rippleTimeToDate(loan.nextPaymentDueDate).toLocaleString("en-GB") : "—"} · grace {formatDuration(loan.gracePeriod)}
            {graceEnd > 0 && <> (until <Countdown due={graceEnd} className="text-muted-foreground" prefixOverdue="expired " />)</>}
          </Note>
        </div>
        <div>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Payments made</span>
            <span className="tabular-nums">{made} / {total} · {loan.paymentRemaining} remaining</span>
          </div>
          <ProgressBar ratio={total > 0 ? made / total : 0} tone={status === "defaulted" ? "down" : status === "impaired" ? "warning" : "up"} label="Payments made" className="mt-1.5" />
          <Note className="mt-1.5">Derived from the ledger&apos;s start and next-due dates.</Note>
        </div>
      </div>

      <div>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-[.1em] text-muted-foreground">Projected schedule · {schedule.length} period{schedule.length === 1 ? "" : "s"}</p>
          <span className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="inline-block size-2 rounded-sm bg-[var(--chart-1)]" /> principal {xrp(totals.principalDrops, 2)}</span>
            <span className="flex items-center gap-1"><span className="inline-block size-2 rounded-sm bg-[var(--chart-4)]" /> interest {xrp(totals.interestDrops, 2)}</span>
          </span>
        </div>
        {data.length === 0 ? (
          <p className="grid h-24 place-items-center text-xs text-muted-foreground">Nothing left to schedule.</p>
        ) : (
          <BarsChart
            data={data}
            xKey="period"
            height={170}
            series={[{ key: "principal", label: "Principal", color: chartColor.c1, stack: "p" }, { key: "interest", label: "Interest", color: chartColor.c4, stack: "p" }]}
            yFormat={formatXrpAxis}
            format={fmtXrp}
          />
        )}
        <Note className={cn("mt-1")}>
          <strong className="font-medium text-foreground">Projection, not realised interest.</strong> Amortised from the principal outstanding at the ledger&apos;s periodic payment and {tenthBpsToPercent(loan.interestRate)} annualised ({(rate * 100).toFixed(3)} % per {formatDuration(loan.paymentInterval)}). The vault earns interest only when a payment delivers it (cash-basis accounting); the ledger&apos;s own figure for scheduled interest remaining is {xrp(loan.scheduledInterestRemainingDrops)}.
        </Note>
      </div>
    </div>
  );
}

export function LoanPanel({ loan }: { loan: LoanState }) {
  return (
    <Panel title={<span>Loan <Mono value={loan.loanId} short={12} className="normal-case tracking-normal" /></span>} actions={<StatusBadge status={loanStatus(loan.flags, loan)} />}>
      <LoanDetailBody loan={loan} />
    </Panel>
  );
}
