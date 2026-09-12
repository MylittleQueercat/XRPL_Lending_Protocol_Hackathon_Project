import { Badge } from "@/components/ui/badge";
import { VS_VALUE_TITLE, verboseLabel, type VsValue } from "@/lib/pricing";

const TONE = { discount: "success", premium: "warning", par: "secondary", unknown: "outline" } as const;

// The one way to show price against accounting value. Compact in tables, verbose where it stands alone.
export function ValueBadge({ value, verbose = false, className }: { value: VsValue; verbose?: boolean; className?: string }) {
  return (
    <Badge variant={TONE[value.kind]} className={["tabular-nums", className].filter(Boolean).join(" ")} title={VS_VALUE_TITLE[value.kind]}>
      {verbose ? verboseLabel(value) : value.label}
    </Badge>
  );
}
