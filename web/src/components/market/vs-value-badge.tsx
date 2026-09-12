import { Badge } from "@/components/ui/badge";
import type { VsValue } from "./pricing";

const TONE = { discount: "success", premium: "warning", par: "secondary", unknown: "outline" } as const;

const TITLE: Record<VsValue["kind"], string> = {
  discount: "Asked price is below the position's accounting value. A discount is not yield.",
  premium: "Asked price is above the position's accounting value.",
  par: "Asked price equals the position's accounting value.",
  unknown: "Accounting value unavailable.",
};

export function VsValueBadge({ value }: { value: VsValue }) {
  return <Badge variant={TONE[value.kind]} className="tabular-nums" title={TITLE[value.kind]}>{value.label}</Badge>;
}
