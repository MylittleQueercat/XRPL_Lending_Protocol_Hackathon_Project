"use client";

import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Panel, PanelEmpty } from "@/components/terminal";
import type { LoanState } from "@/lib/ledger";
import { loanStatus } from "./lending";
import { AddressLink, Countdown, Mono, StatusBadge, xrp } from "./shared";

// Every loan originated by the wallet's brokers, one line each. Row click opens the loan.
export function LoansTable({ loans, onOpen }: { loans: LoanState[] | null; onOpen: (loanId: string) => void }) {
  return (
    <Panel title={<span>Loans{loans && <span className="ml-1.5 rounded-full bg-secondary px-1.5 text-[10px] tabular-nums">{loans.length}</span>}</span>} actions={<span className="text-[10px] text-muted-foreground">click a loan for its schedule</span>}>
      {loans === null ? (
        <div className="space-y-2 p-3"><Skeleton className="h-5" /><Skeleton className="h-5" /></div>
      ) : loans.length === 0 ? (
        <PanelEmpty>No loan yet. Originate one from a vault card.</PanelEmpty>
      ) : (
        <div className="overflow-x-auto">
          <Table className="terminal-table">
            <TableHeader>
              <TableRow>
                <TableHead>Loan</TableHead><TableHead>Borrower</TableHead><TableHead className="text-right">Principal outstanding</TableHead>
                <TableHead className="text-right">Remaining</TableHead><TableHead>Next due</TableHead><TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loans.map((l) => (
                <TableRow key={l.loanId} className="cursor-pointer" onClick={() => onOpen(l.loanId)}>
                  <TableCell><button type="button" className="text-left" onClick={() => onOpen(l.loanId)}><Mono value={l.loanId} /></button></TableCell>
                  <TableCell><AddressLink address={l.borrower} /></TableCell>
                  <TableCell className="text-right">{xrp(l.principalOutstandingDrops)}</TableCell>
                  <TableCell className="text-right">{l.paymentRemaining}</TableCell>
                  <TableCell className="text-xs"><Countdown due={l.nextPaymentDueDate} /></TableCell>
                  <TableCell><StatusBadge status={loanStatus(l.flags, l)} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Panel>
  );
}
