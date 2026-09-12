"use client";

import * as React from "react";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { explorerAccount, explorerTx } from "@/lib/network";
import { shortAddress, shortHash } from "@/lib/format";
import { liquidityPicture } from "@/components/position/position-math";
import { isLoanDefaulted, isLoanImpaired } from "./lending";

export function Field({ id, label, hint, children, className }: { id: string; label: string; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function XrpInput({ id, value, onChange, placeholder }: { id: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <Input id={id} inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder ?? "0"} className="pr-12 tabular-nums" />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">XRP</span>
    </div>
  );
}

export function Select({ id, value, onChange, options }: { id: string; value: string; onChange: (v: string) => void; options: ReadonlyArray<{ label: string; value: string }> }) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

// Ledger index shown short, copyable on hover, with the full value as title.
export function Mono({ value, short = 8, className }: { value: string; short?: number; className?: string }) {
  return <code className={cn("font-mono text-xs", className)} title={value}>{value.length > short + 1 ? `${value.slice(0, short)}…` : value}</code>;
}

export function AddressLink({ address }: { address: string }) {
  return (
    <a href={explorerAccount(address)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-xs hover:underline" title={address}>
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

// Share of assets currently deployed in loans. Pure divs so it needs no dependency.
export function UtilisationBar({ totalDrops, availableDrops }: { totalDrops: string; availableDrops: string }) {
  const ratio = liquidityPicture(totalDrops, availableDrops).utilisation;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Utilisation</span>
        <span className="tabular-nums">{(ratio * 100).toFixed(1)} %</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(ratio * 100)} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}

export function LoanFlags({ flags }: { flags: number }) {
  const defaulted = isLoanDefaulted(flags);
  const impaired = isLoanImpaired(flags);
  if (!defaulted && !impaired) return <Badge variant="success">Performing</Badge>;
  return (
    <span className="flex gap-1">
      {defaulted && <Badge variant="destructive">Defaulted</Badge>}
      {impaired && <Badge variant="warning">Impaired</Badge>}
    </span>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

export function ConnectPrompt({ role }: { role: string }) {
  return <EmptyState>Connect a wallet to act as the {role}. Use the wallet button in the header.</EmptyState>;
}
