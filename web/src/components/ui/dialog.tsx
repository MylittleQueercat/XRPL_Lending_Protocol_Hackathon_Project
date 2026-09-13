"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

// A modal on the native <dialog> element: focus trapping, Escape and backdrop close come from the
// browser. Screens keep their surface light and open details, tickets and tables in here.
export function Dialog({ open, onClose, title, description, children, size = "md", className }: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const ref = React.useRef<HTMLDialogElement>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  const width = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-5xl" }[size];
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
      className={cn("m-auto w-[calc(100vw-2rem)] rounded-xl border border-border bg-card p-0 text-card-foreground shadow-[0_24px_60px_-20px_rgba(0,0,0,0.35)] backdrop:bg-black/40 backdrop:backdrop-blur-[2px] open:raise-panel", width, className)}
      aria-label={typeof title === "string" ? title : undefined}
    >
      {open && (
        <div className="flex max-h-[calc(100vh-4rem)] flex-col">
          <header className="flex items-start gap-3 border-b border-border px-5 py-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold leading-tight">{title}</h2>
              {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
            </div>
            <Button size="icon" variant="ghost" className="-mr-2 -mt-1 size-8" aria-label="Close" onClick={onClose}><X className="size-4" /></Button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        </div>
      )}
    </dialog>
  );
}

// A button that opens a dialog; keeps the open state local so callers stay small.
export function DialogTrigger({ label, title, description, size, children, variant = "outline", buttonSize = "sm", className, icon }: {
  label: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
  variant?: React.ComponentProps<typeof Button>["variant"];
  buttonSize?: React.ComponentProps<typeof Button>["size"];
  className?: string;
  icon?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const close = React.useCallback(() => setOpen(false), []);
  return (
    <>
      <Button variant={variant} size={buttonSize} className={className} onClick={() => setOpen(true)}>{icon}{label}</Button>
      <Dialog open={open} onClose={close} title={title} description={description} size={size}>
        {typeof children === "function" ? children(close) : children}
      </Dialog>
    </>
  );
}
