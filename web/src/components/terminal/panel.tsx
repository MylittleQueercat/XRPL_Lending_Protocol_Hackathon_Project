import * as React from "react";
import { cn } from "@/lib/utils";

// A workstation panel: one-line uppercase header with optional actions, dense body.
export function Panel({ title, actions, children, className, bodyClassName, id }: { title?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string; bodyClassName?: string; id?: string }) {
  return (
    <section id={id} className={cn("terminal-panel flex min-w-0 flex-col", className)} aria-label={typeof title === "string" ? title : undefined}>
      {(title || actions) && (
        <header className="terminal-head">
          <span className="truncate">{title}</span>
          {actions && <span className="ml-auto flex items-center gap-1 normal-case tracking-normal">{actions}</span>}
        </header>
      )}
      <div className={cn("min-w-0 flex-1", bodyClassName)}>{children}</div>
    </section>
  );
}

export interface TabDef<T extends string> { id: T; label: React.ReactNode; count?: number }

// Bottom-toolbox style tabs (Trade / Orders / History).
export function PanelTabs<T extends string>({ tabs, value, onChange, className, ariaLabel }: { tabs: ReadonlyArray<TabDef<T>>; value: T; onChange: (id: T) => void; className?: string; ariaLabel?: string }) {
  return (
    <div role="tablist" aria-label={ariaLabel} className={cn("flex items-stretch gap-0 overflow-x-auto border-b border-border bg-terminal-head text-xs", className)}>
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id} role="tab" type="button" aria-selected={active} onClick={() => onChange(t.id)}
            className={cn("relative flex h-9 items-center gap-1.5 px-3.5 font-medium whitespace-nowrap transition-colors", active ? "bg-terminal text-foreground after:absolute after:inset-x-0 after:top-0 after:h-0.5 after:bg-primary" : "text-muted-foreground hover:text-foreground")}
          >
            {t.label}
            {typeof t.count === "number" && <span className={cn("rounded-full px-1.5 text-[10px] tabular-nums", active ? "bg-accent text-accent-foreground" : "bg-secondary")}>{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function PanelEmpty({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid min-h-24 place-items-center px-4 py-6 text-center text-xs text-muted-foreground", className)}>{children}</div>;
}
