import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { SellTicket } from "@/components/sell/sell-ticket";

export const metadata = { title: "Sell shares" };

export default function Page() {
  return (
    <>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-base font-semibold">Sell shares</h1>
        <p className="text-xs text-muted-foreground">List shares at a price you set. Your holding is read from the validated ledger before anything is listed.</p>
      </div>
      <div className="space-y-3">
        <Suspense fallback={<Skeleton className="h-48" />}>
          <SellTicket />
        </Suspense>
      </div>
    </>
  );
}
