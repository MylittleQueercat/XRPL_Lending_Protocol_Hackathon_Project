import { cn } from "@/lib/utils";
import styles from "./logo.module.css";

export function RaiseMark({ className }: { className?: string }) {
  return (
    // Static brand artwork: preserve the approved bitmap without an optimization request.
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/brand/raise-mark.png?v=2" width={512} height={512} alt="" aria-hidden="true" className={cn(styles.mark, className)} />
  );
}

export function Logo({ className, wordmarkClassName }: { className?: string; wordmarkClassName?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)} aria-label="Raise">
      <RaiseMark />
      <span aria-hidden="true" className={cn(styles.wordmark, wordmarkClassName)}>raise</span>
    </span>
  );
}
