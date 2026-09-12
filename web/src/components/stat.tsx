import { cn } from "@/lib/utils";

// Key figure with a label. Numbers are tabular so columns of them align.
export function Stat({ label, value, hint, className }: { label: string; value: React.ReactNode; hint?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-md bg-surface px-4 py-3", className)}>
      <p className="body4 text-muted-foreground">{label}</p>
      <div className="heading1 mt-0.5 tabular-nums">{value}</div>
      {hint && <div className="body4 mt-0.5 text-muted-foreground">{hint}</div>}
    </div>
  );
}
