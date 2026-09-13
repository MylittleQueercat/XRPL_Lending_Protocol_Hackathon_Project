"use client";

import * as React from "react";
import { CheckCircle2, ExternalLink, Info, X, XCircle } from "lucide-react";
import { explainResult, type Submitted } from "@/lib/ledger";
import { explorerTx } from "@/lib/network";
import { shortHash } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface Toast {
  id: number;
  tone: "success" | "error" | "info";
  title: React.ReactNode;
  description?: React.ReactNode;
  hash?: string;
  ledgerIndex?: number;
  code?: string;
}

interface ToastApi {
  push: (toast: Omit<Toast, "id">) => number;
  // One shape for every ledger outcome: title, code, plain-language reason, hash and explorer link.
  pushResult: (result: Submitted, title: string, context?: Parameters<typeof explainResult>[1], description?: React.ReactNode) => number;
  dismiss: (id: number) => void;
}

const ToastContext = React.createContext<ToastApi | null>(null);
const SUCCESS_MS = 9_000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const counter = React.useRef(0);
  const dismiss = React.useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);
  const push = React.useCallback((toast: Omit<Toast, "id">) => {
    const id = ++counter.current;
    setToasts((list) => [...list.slice(-3), { ...toast, id }]);
    if (toast.tone !== "error") setTimeout(() => dismiss(id), SUCCESS_MS);
    return id;
  }, [dismiss]);
  const pushResult = React.useCallback<ToastApi["pushResult"]>((result, title, context, description) => {
    const ok = result.resultCode === "tesSUCCESS";
    return push({ tone: ok ? "success" : "error", title, code: result.resultCode, description: description ?? explainResult(result.resultCode, context), hash: result.hash || undefined, ledgerIndex: result.ledgerIndex || undefined });
  }, [push]);
  const api = React.useMemo(() => ({ push, pushResult, dismiss }), [push, pushResult, dismiss]);
  // The container is a manual popover: the browser puts it in the top layer, above open modal
  // dialogs, so a ledger verdict is visible even while the ticket that produced it is still open.
  const layer = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = layer.current as (HTMLDivElement & { showPopover?: () => void; hidePopover?: () => void }) | null;
    if (!el || typeof el.showPopover !== "function") return;
    try {
      if (toasts.length === 0) { el.hidePopover?.(); return; }
      el.hidePopover?.();
      el.showPopover();
    } catch { /* Popover API unsupported or already in the requested state. */ }
  }, [toasts]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        ref={layer}
        popover="manual"
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed z-[100] flex w-full flex-col items-center gap-2 border-0 bg-transparent p-0 px-4"
        style={{ inset: "auto 0 1rem 0", margin: 0, maxWidth: "100vw" }}
      >
        {toasts.map((t) => <ToastCard key={t.id} toast={t} onClose={() => dismiss(t.id)} />)}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const Icon = toast.tone === "success" ? CheckCircle2 : toast.tone === "error" ? XCircle : Info;
  return (
    <div role="status" className={cn("raise-state pointer-events-auto flex w-full max-w-lg items-start gap-3 rounded-xl border bg-card px-4 py-3 text-sm shadow-[0_16px_40px_-16px_rgba(0,0,0,0.35)]", toast.tone === "success" && "border-success/40", toast.tone === "error" && "border-destructive/40", toast.tone === "info" && "border-border")}>
      <Icon className={cn("mt-0.5 size-4 shrink-0", toast.tone === "success" && "text-success", toast.tone === "error" && "text-destructive", toast.tone === "info" && "text-primary")} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{toast.title}{toast.code && <> · <code className="font-mono text-xs">{toast.code}</code></>}</p>
        {toast.description && <p className="mt-0.5 text-xs text-muted-foreground [overflow-wrap:anywhere]">{toast.description}</p>}
        {toast.hash && (
          <a href={explorerTx(toast.hash)} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline">
            {shortHash(toast.hash)}{toast.ledgerIndex ? ` · ledger ${toast.ledgerIndex.toLocaleString("en-US")}` : ""} <ExternalLink className="size-3" />
          </a>
        )}
      </div>
      <button type="button" onClick={onClose} aria-label="Dismiss" className="-mr-1 -mt-1 rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"><X className="size-3.5" /></button>
    </div>
  );
}

export function useToast(): ToastApi {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>.");
  return ctx;
}
