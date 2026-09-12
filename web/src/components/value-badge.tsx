import { badgeVariants } from "@/components/ui/badge";
import { VS_VALUE_TITLE, verboseLabel, type VsValue } from "@/lib/pricing";
import { cn } from "@/lib/utils";

// Terminal convention: a discount (price below accounting value) is blue, a premium is red, par is muted.
const TONE = {
  discount: "bg-up-soft text-up",
  premium: "bg-down-soft text-down",
  par: "bg-secondary text-muted-foreground",
  unknown: "border-border text-muted-foreground",
} as const;

// The one way to show price against accounting value. Compact in tables, verbose where it stands alone.
export function ValueBadge({ value, verbose = false, className }: { value: VsValue; verbose?: boolean; className?: string }) {
  return (
    <span className={cn(badgeVariants({ variant: "outline" }), "border-transparent tabular-nums", TONE[value.kind], className)} title={VS_VALUE_TITLE[value.kind]}>
      {verbose ? verboseLabel(value) : value.label}
    </span>
  );
}
