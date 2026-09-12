import { Badge } from "@/components/ui/badge";
import type { OfferState } from "@/lib/offers";
import { STATE_TONE } from "./pricing";

export function OfferStatusBadge({ state }: { state: OfferState }) {
  return <Badge variant={STATE_TONE[state]} className="capitalize">{state}</Badge>;
}
