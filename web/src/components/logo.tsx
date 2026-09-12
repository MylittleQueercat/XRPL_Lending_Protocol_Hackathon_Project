import { cn } from "@/lib/utils";

export function RaiseMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" aria-hidden="true" className={cn("h-9 w-auto", className)}>
      <rect width="40" height="40" rx="12" fill="#c5e6a4" />
      <path d="M11 28V21L20 12H28V20L20 28H11Z" fill="#233d32" />
      <path d="M15 25L25 15M18 15H25V22" stroke="#c5e6a4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ className, wordmarkClassName }: { className?: string; wordmarkClassName?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <RaiseMark />
      <span className={cn("text-[27px] font-semibold leading-none tracking-[-1.3px]", wordmarkClassName)}>raise<span className="text-success">.</span></span>
    </span>
  );
}
