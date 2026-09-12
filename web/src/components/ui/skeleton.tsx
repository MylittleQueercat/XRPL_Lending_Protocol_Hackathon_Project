import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div aria-hidden="true" data-slot="skeleton" className={cn("raise-skeleton rounded-md bg-secondary", className)} {...props} />;
}

export { Skeleton };
