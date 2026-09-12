import { formatPercent, formatXrp } from "@/lib/format";
import type { LiquidityPicture } from "./position-math";

// A single bar: cash on the left, capital out on loan on the right. The marker shows where a
// pending request lands against the cash actually in the vault.
export function LiquidityBar({ picture, fundableDrops, requestedDrops }: { picture: LiquidityPicture; fundableDrops?: string; requestedDrops?: string }) {
  const total = BigInt(picture.totalDrops || "0");
  const pct = (drops: string) => (total === 0n ? 0 : Number((BigInt(drops) * 10_000n) / total) / 100);
  const availablePct = pct(picture.availableDrops);
  const requestedPct = requestedDrops ? Math.min(100, pct(requestedDrops)) : null;
  return (
    <div className="space-y-2">
      <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label={`${formatPercent(1 - picture.utilisation)} of vault assets available as cash`}>
        <div className="h-full bg-success/70" style={{ width: `${availablePct}%` }} />
        {requestedPct !== null && <div className="absolute inset-y-0 w-0.5 bg-foreground" style={{ left: `calc(${requestedPct}% - 1px)` }} title="Your request" />}
      </div>
      <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>
          <span className="mr-1 inline-block size-2 rounded-full bg-success/70 align-middle" />
          Available cash <span className="tabular-nums">{formatXrp(picture.availableDrops)}</span>
        </span>
        <span>
          <span className="mr-1 inline-block size-2 rounded-full bg-muted-foreground/40 align-middle" />
          Deployed in loans <span className="tabular-nums">{formatXrp(picture.deployedDrops)}</span> · {formatPercent(picture.utilisation)} utilised
        </span>
        {fundableDrops && (
          <span>
            Fundable for you today: <span className="tabular-nums text-foreground">{formatXrp(fundableDrops)}</span>
          </span>
        )}
      </div>
    </div>
  );
}
