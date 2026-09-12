import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { PositionView } from "@/components/position/position-view";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = { title: "My position" };

export default function Page() {
  return (
    <>
      <PageHeader title="My position" description="Your vault shares, what they are worth on the vault's books, and how much of that the vault could actually pay you today." />
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <PositionView />
      </Suspense>
    </>
  );
}
