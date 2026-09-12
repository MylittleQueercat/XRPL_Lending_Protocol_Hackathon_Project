"use client";

import * as React from "react";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { explorerAccount, explorerTx } from "@/lib/network";
import { formatXrp, shortAddress, shortHash } from "@/lib/format";
import { rippleTimeToDate } from "@/lib/ledger";
import { utilisationOf } from "@/lib/history";
import { ceilDrops, formatCountdown, loanStatus, secondsUntilRippleTime, type LoanStatus } from "./lending";

// Loan fields may be fractional drops; round up to a whole drop before formatting, like a payment would.
export const xrp = (value: string, decimals = 6) => formatXrp(ceilDrops(value), decimals);

export const DENSE_INPUT = "h-8 px-2.5 text-sm";

export function Field({ id, label, hint, children, className }: { id: string; label: string; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1", className)}>
      <Label htmlFor={id} className="text-[11px] font-medium text-muted-foreground">{label}</Label>
      {children}
      {hint && <p className="text-[11px] leading-snug text-muted-foreground">{hint}</p>}
    </div>
  );
}

function SuffixInput({ id, value, onChange, placeholder, suffix, inputMode = "decimal", invalid }: { id: string; value: string; onChange: (v: string) => void; placeholder?: string; suffix: string; inputMode?: "decimal" | "numeric"; invalid?: boolean }) {
  return (
    <div className="relative">
      <Input id={id} inputMode={inputMode} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder ?? "0"} className={cn(DENSE_INPUT, "pr-11 tabular-nums")} aria-invalid={invalid || undefined} />
      <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-[11px] text-muted-foreground">{suffix}</span>
    </div>
  );
}

export function XrpInput(props: { id: string; value: string; onChange: (v: string) => void; placeholder?: string; invalid?: boolean }) {
  return <SuffixInput {...props} suffix="XRP" />;
}

export function PercentInput(props: { id: string; value: string; onChange: (v: string) => void; invalid?: boolean }) {
  return <SuffixInput {...props} suffix="%" />;
}

export function Select({ id, value, onChange, options }: { id: string; value: string; onChange: (v: string) => void; options: ReadonlyArray<{ label: string; value: string }> }) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/25 dark:bg-transparent"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

// Ledger index shown short, with the full value as title.
export function Mono({ value, short = 8, className }: { value: string; short?: number; className?: string }) {
  return <code className={cn("font-mono text-xs", className)} title={value}>{value.length > short + 1 ? `${value.slice(0, short)}…` : value}</code>;
}

export function AddressLink({ address, className }: { address: string; className?: string }) {
  return (
    <a href={explorerAccount(address)} target="_blank" rel="noreferrer" className={cn("inline-flex items-center gap-1 font-mono text-xs hover:underline", className)} title={address}>
      {shortAddress(address)} <ExternalLink className="size-3" />
    </a>
  );
}

export function TxLink({ hash }: { hash: string }) {
  return (
    <a href={explorerTx(hash)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline" title={hash}>
      {shortHash(hash)} <ExternalLink className="size-3" />
    </a>
  );
}

// Thin progress bar. Tone follows the terminal convention: blue is fine, amber is a warning, red is bad.
export function ProgressBar({ ratio, tone = "up", label, className }: { ratio: number; tone?: "up" | "down" | "warning" | "muted"; label?: string; className?: string }) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0)) * 100;
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-secondary", className)} role="progressbar" aria-label={label} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full transition-[width] duration-500", tone === "up" && "bg-up", tone === "down" && "bg-down", tone === "warning" && "bg-warning", tone === "muted" && "bg-muted-foreground/50")} style={{ width: `${pct}%` }} />
    </div>
  );
}

// Share of assets currently deployed in loans.
export function UtilisationBar({ totalDrops, availableDrops, compact }: { totalDrops: string; availableDrops: string; compact?: boolean }) {
  const ratio = utilisationOf(totalDrops, availableDrops);
  return (
    <div className="space-y-1">
      {!compact && (
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Utilisation</span>
          <span className="tabular-nums">{(ratio * 100).toFixed(1)} %</span>
        </div>
      )}
      <ProgressBar ratio={ratio} tone="up" label="Utilisation" className={compact ? "h-1" : undefined} />
    </div>
  );
}

// Loan status colours: blue performing, amber impaired, red defaulted.
export const STATUS_LABEL: Record<LoanStatus, string> = { performing: "Performing", impaired: "Impaired", defaulted: "Defaulted", repaid: "Repaid" };

export function StatusDot({ status, className }: { status: LoanStatus; className?: string }) {
  return <span className={cn("inline-block size-1.5 shrink-0 rounded-full", status === "performing" && "bg-up", status === "repaid" && "bg-muted-foreground/60", status === "impaired" && "bg-warning", status === "defaulted" && "bg-down", className)} aria-hidden />;
}

export function StatusBadge({ status }: { status: LoanStatus }) {
  return (
    <span className={cn("inline-flex h-5 items-center gap-1.5 rounded-full px-2 text-[11px] font-medium", status === "performing" && "bg-up-soft text-up", status === "repaid" && "bg-secondary text-muted-foreground", status === "impaired" && "bg-warning/15 text-warning-foreground dark:text-warning", status === "defaulted" && "bg-down-soft text-down")}>
      <StatusDot status={status} />{STATUS_LABEL[status]}
    </span>
  );
}

export function LoanFlags({ flags }: { flags: number }) {
  return <StatusBadge status={loanStatus(flags)} />;
}

// Wall clock that ticks once a second for live countdowns.
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

// Live countdown to a ripple-epoch due date; red once overdue.
export function Countdown({ due, className, prefixOverdue = "overdue " }: { due: number; className?: string; prefixOverdue?: string }) {
  const now = useNow();
  if (!due) return <span className={cn("text-muted-foreground", className)}>—</span>;
  const seconds = secondsUntilRippleTime(due, now);
  const overdue = seconds < 0;
  return (
    <span className={cn("font-mono tabular-nums", overdue ? "text-down" : "text-foreground", className)} title={rippleTimeToDate(due).toLocaleString("en-GB")}>
      {overdue ? `${prefixOverdue}${formatCountdown(seconds)}` : formatCountdown(seconds)}
    </span>
  );
}

// Compact labelled figure for dense panels.
export function Figure({ label, value, sub, tone, className }: { label: React.ReactNode; value: React.ReactNode; sub?: React.ReactNode; tone?: "up" | "down" | "warning"; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="truncate text-[10px] font-semibold uppercase tracking-[.1em] text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 truncate text-sm font-semibold tabular-nums", tone === "up" && "text-up", tone === "down" && "text-down", tone === "warning" && "text-warning-foreground dark:text-warning")}>{value}</p>
      {sub && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md border border-dashed px-4 py-6 text-center text-xs text-muted-foreground">{children}</p>;
}

export function ConnectPrompt({ role }: { role: string }) {
  return <EmptyState>Connect a wallet to act as the {role}. Use the wallet button in the header.</EmptyState>;
}

export function Note({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("text-[11px] leading-snug text-muted-foreground", className)}>{children}</p>;
}

export { Badge };
