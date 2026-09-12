"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { readLoansForBrokers, readOwnedBrokers, type BrokerState, type LoanState, type VaultState } from "@/lib/ledger";
import { formatXrp, shortAddress, shortHash } from "@/lib/format";

interface Deployed { brokers: BrokerState[]; loans: LoanState[]; error?: string }

// Brokers and loans run by the vault owner: what stands between the vault and the holder's cash.
// Informative only, loaded when opened, and a failure here never takes the position down.
export function DeployedPanel({ vault, txEpoch }: { vault: VaultState | null; txEpoch: number }) {
  const [open, setOpen] = React.useState(false);
  const [deployed, setDeployed] = React.useState<Deployed | null>(null);
  const [loading, setLoading] = React.useState(false);
  const owner = vault?.owner ?? null;

  React.useEffect(() => {
    if (!open || !owner) return;
    let cancelled = false;
    setLoading(true);
    readOwnedBrokers(owner).then(async (brokers) => [brokers, await readLoansForBrokers(brokers)] as const)
      .then(([brokers, loans]) => { if (!cancelled) setDeployed({ brokers, loans }); })
      .catch((cause) => { if (!cancelled) setDeployed({ brokers: [], loans: [], error: (cause as Error).message }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, owner, txEpoch]);

  if (!vault) return null;
  return (
    <details className="terminal-panel group" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="terminal-head cursor-pointer list-none select-none [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" aria-hidden />
        <span>Where the capital is</span>
        <span className="ml-auto font-mono normal-case tracking-normal">owner {shortAddress(vault.owner)}</span>
      </summary>
      <div className="space-y-2 p-2">
        <p className="px-1 text-xs text-muted-foreground">Brokers and loans run by the vault owner. This lookup alone does not establish where all assets are held; the cash figure above is what the vault can pay today.</p>
        {loading && !deployed && <Skeleton className="h-16 w-full" />}
        {deployed?.error && <p className="px-1 text-xs text-muted-foreground">Loan details unavailable right now: {deployed.error}</p>}
        {deployed && !deployed.error && deployed.brokers.length === 0 && deployed.loans.length === 0 && <p className="px-1 text-xs text-muted-foreground">No brokers or loans found for this vault owner.</p>}
        {deployed && deployed.brokers.length > 0 && (
          <Table className="terminal-table">
            <TableHeader>
              <TableRow><TableHead>Broker</TableHead><TableHead>Vault</TableHead><TableHead className="text-right">Debt outstanding</TableHead><TableHead className="text-right">First-loss cover</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {deployed.brokers.map((b) => (
                <TableRow key={b.loanBrokerId}>
                  <TableCell className="font-mono" title={b.loanBrokerId}>{shortHash(b.loanBrokerId)}</TableCell>
                  <TableCell className="font-mono" title={b.vaultId}>{b.vaultId === vault.vaultId ? <Badge variant="outline" className="h-5 text-[10px]">this vault</Badge> : shortHash(b.vaultId)}</TableCell>
                  <TableCell className="text-right">{formatXrp(b.debtTotalDrops)}</TableCell>
                  <TableCell className="text-right">{formatXrp(b.coverAvailableDrops)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {deployed && deployed.loans.length > 0 && (
          <Table className="terminal-table">
            <TableHeader>
              <TableRow><TableHead>Loan</TableHead><TableHead>Borrower</TableHead><TableHead className="text-right">Principal outstanding</TableHead><TableHead className="text-right">Payments left</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {deployed.loans.map((l) => (
                <TableRow key={l.loanId}>
                  <TableCell className="font-mono" title={l.loanId}>{shortHash(l.loanId)}</TableCell>
                  <TableCell className="font-mono">{shortAddress(l.borrower)}</TableCell>
                  <TableCell className="text-right">{formatXrp(l.principalOutstandingDrops.split(".")[0])}</TableCell>
                  <TableCell className="text-right">{l.paymentRemaining}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </details>
  );
}
