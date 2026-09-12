import { cn } from "@/lib/utils";

export function PageHeader({ title, description, action, className }: { title: string; description?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-8 flex flex-wrap items-end justify-between gap-4 lg:mb-10", className)}>
      <div className="min-w-0">
        <h1 className="text-3xl font-semibold tracking-[-0.025em] leading-tight md:text-4xl">{title}</h1>
        {description && <p className="body3 mt-3 max-w-2xl text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}
