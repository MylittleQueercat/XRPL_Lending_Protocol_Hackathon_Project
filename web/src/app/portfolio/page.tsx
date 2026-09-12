import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { PortfolioTerminal } from "@/components/portfolio/portfolio-terminal";

export const metadata = { title: "Portfolio" };

// useSearchParams (the ?vault= preselect) needs a Suspense boundary for static rendering.
export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <PortfolioTerminal />
    </Suspense>
  );
}
