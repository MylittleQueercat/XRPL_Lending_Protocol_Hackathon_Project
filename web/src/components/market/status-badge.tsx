import type { OfferState } from "@/lib/offers";
import { cn } from "@/lib/utils";

// Quote-board status: a coloured dot and a short uppercase word. Open is blue (tradable), settling
// amber (locked), settled sage (done), the rest muted.
const DOT: Record<OfferState, string> = {
  open: "bg-up",
  settling: "bg-warning",
  settled: "bg-primary",
  draft: "bg-muted-foreground/50",
  cancelled: "bg-muted-foreground/50",
  expired: "bg-muted-foreground/50",
};

export function OfferStatusBadge({ state, className }: { state: OfferState; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[.08em]", state === "open" ? "text-foreground" : "text-muted-foreground", className)}>
      <span className={cn("size-1.5 rounded-full", DOT[state])} aria-hidden />
      {state}
    </span>
  );
}
