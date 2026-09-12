"use client";

import * as React from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { dropsToXrpString } from "@/lib/format";

export type Direction = "up" | "down" | "flat";

export function directionOf(delta: number | bigint): Direction {
  if (typeof delta === "bigint") return delta > 0n ? "up" : delta < 0n ? "down" : "flat";
  if (!Number.isFinite(delta) || Math.abs(delta) < 1e-12) return "flat";
  return delta > 0 ? "up" : "down";
}

export const directionClass: Record<Direction, string> = { up: "tick-up", down: "tick-down", flat: "text-muted-foreground" };

// Remembers the previous value so the cell can flash blue or red when it moves, like a quote.
export function useTickFlash(value: string | number | null | undefined): Direction | null {
  const previous = React.useRef(value);
  const [flash, setFlash] = React.useState<Direction | null>(null);
  React.useEffect(() => {
    if (previous.current === value || value === null || value === undefined || previous.current === null || previous.current === undefined) { previous.current = value; return; }
    const before = Number(previous.current);
    const after = Number(value);
    previous.current = value;
    if (!Number.isFinite(before) || !Number.isFinite(after) || before === after) return;
    setFlash(after > before ? "up" : "down");
    const timer = setTimeout(() => setFlash(null), 900);
    return () => clearTimeout(timer);
  }, [value]);
  return flash;
}

// A value that flashes on change. Pass `numeric` (the comparable number) when the display text is formatted.
export function Tick({ numeric, children, className }: { numeric: string | number | null | undefined; children: React.ReactNode; className?: string }) {
  const flash = useTickFlash(numeric);
  return <span className={cn("inline-block rounded px-1 -mx-1 tabular-nums", flash === "up" && "tick-flash-up", flash === "down" && "tick-flash-down", className)}>{children}</span>;
}

// Signed change with arrow and colour: "+12.5 %" in blue, "−3.1 %" in red, "0.0 %" muted.
export function Delta({ ratio, decimals = 2, className, hideArrow }: { ratio: number | null | undefined; decimals?: number; className?: string; hideArrow?: boolean }) {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return <span className={cn("text-muted-foreground", className)}>—</span>;
  const direction = directionOf(ratio);
  const Icon = direction === "up" ? ArrowUpRight : direction === "down" ? ArrowDownRight : Minus;
  return (
    <span className={cn("inline-flex items-center gap-0.5 tabular-nums", directionClass[direction], className)}>
      {!hideArrow && <Icon className="size-3.5" />}
      {direction === "up" ? "+" : direction === "down" ? "−" : ""}{(Math.abs(ratio) * 100).toFixed(decimals)} %
    </span>
  );
}

// Signed XRP amount in drops: "+50 XRP" blue, "−12.3 XRP" red.
export function SignedXrp({ drops, className, decimals = 6, zeroLabel = "0 XRP" }: { drops: string | bigint; className?: string; decimals?: number; zeroLabel?: string }) {
  const value = typeof drops === "bigint" ? drops : BigInt(drops || "0");
  const direction = directionOf(value);
  const abs = value < 0n ? -value : value;
  return (
    <span className={cn("tabular-nums", directionClass[direction], className)}>
      {direction === "flat" ? zeroLabel : `${direction === "up" ? "+" : "−"}${dropsToXrpString(abs, decimals)} XRP`}
    </span>
  );
}

export function DirectionDot({ direction, className }: { direction: Direction; className?: string }) {
  return <span className={cn("inline-block size-1.5 rounded-full", direction === "up" ? "bg-up" : direction === "down" ? "bg-down" : "bg-muted-foreground/50", className)} aria-hidden />;
}
