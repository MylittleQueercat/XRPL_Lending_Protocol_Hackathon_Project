import * as React from "react";
import { cn } from "@/lib/utils";

// Account-bar figure: small uppercase label, big tabular value, optional secondary line.
export function Kpi({ label, value, sub, className, tone }: { label: React.ReactNode; value: React.ReactNode; sub?: React.ReactNode; className?: string; tone?: "up" | "down" | "neutral" }) {
  return (
    <div className={cn("min-w-0 px-4 py-2.5", className)}>
      <p className="truncate text-[10px] font-semibold uppercase tracking-[.12em] text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 truncate text-lg font-semibold tabular-nums leading-tight", tone === "up" && "tick-up", tone === "down" && "tick-down")}>{value}</p>
      {sub && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

// A row of KPIs separated by hairlines, like the account summary strip in a trading terminal.
export function KpiStrip({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("terminal-panel grid grid-cols-2 divide-x divide-y divide-border sm:grid-cols-3 lg:grid-cols-6 lg:divide-y-0", className)}>{children}</div>;
}
