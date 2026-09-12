import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { SellFlow } from "@/components/sell/sell-flow";
import { MyOffers } from "@/components/sell/my-offers";

export const metadata = { title: "Sell shares" };

export default function Page() {
  return (
    <>
      <PageHeader title="Sell shares" description="Create, review and cancel an offer on your position. Your holding is read from the validated ledger before anything is listed." />
      <div className="space-y-8">
        <Suspense fallback={<Skeleton className="h-48" />}>
          <SellFlow />
        </Suspense>
        <MyOffers />
      </div>
    </>
  );
}
