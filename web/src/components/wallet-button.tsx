"use client";

import * as React from "react";
import { Copy, KeyRound, LogOut, Sparkles, Wallet as WalletIcon, Check, ExternalLink, X, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { useWallet } from "@/lib/wallet";
import { formatXrp, shortAddress } from "@/lib/format";
import { explorerAccount } from "@/lib/network";

export function WalletButton() {
  const wallet = useWallet();
  const [open, setOpen] = React.useState(false);
  const [seed, setSeed] = React.useState("");
  const [copied, setCopied] = React.useState(false);
  const [busy, setBusy] = React.useState<"create" | "import" | null>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const closeRef = React.useRef<HTMLButtonElement>(null);
  const copyTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelId = React.useId();

  const closePanel = React.useCallback((restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  React.useEffect(() => () => {
    if (copyTimer.current) clearTimeout(copyTimer.current);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onClick = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) closePanel();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closePanel(true);
    };
    document.addEventListener("pointerdown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, closePanel]);

  const run = async (kind: "create" | "import", action: () => Promise<void>) => {
    setBusy(kind);
    try {
      await action();
      setSeed("");
    } catch {
      // The provider already surfaced the error in wallet.error.
    } finally {
      setBusy(null);
    }
  };

  const copy = async () => {
    if (!wallet.account) return;
    try {
      await navigator.clipboard.writeText(wallet.account.address);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="relative" ref={panelRef} onBlur={(event) => {
      if (open && event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) closePanel();
    }}>
      <Button ref={triggerRef} variant="secondary" aria-controls={open ? panelId : undefined} onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="dialog">
        <WalletIcon />
        {wallet.account ? <span className="font-mono">{shortAddress(wallet.account.address)}</span> : <><span className="hidden sm:inline">Connect wallet</span><span className="sm:hidden">Connect</span></>}
      </Button>

      {open && (
        <div id={panelId} role="dialog" aria-label="Wallet" className="raise-panel absolute right-0 z-50 mt-3 max-h-[calc(100dvh-7rem)] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto overscroll-contain rounded-xl border border-border bg-popover p-5 text-popover-foreground">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="font-semibold">Wallet</p>
            <Button ref={closeRef} size="icon" variant="ghost" aria-label="Close wallet" onClick={() => closePanel(true)}><X /></Button>
          </div>
          {wallet.account ? (
            <div className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground">{wallet.account.label} · local dev wallet</p>
                <div className="mt-1 flex items-center gap-2">
                  <code className="truncate text-sm">{wallet.account.address}</code>
                  <Button size="icon" variant="ghost" onClick={copy} aria-label={copied ? "Address copied" : "Copy address"}>{copied ? <Check /> : <Copy />}</Button>
                  <a href={explorerAccount(wallet.account.address)} target="_blank" rel="noreferrer" className="raise-focus inline-flex size-10 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground" aria-label="Open in explorer"><ExternalLink className="size-4" /></a>
                </div>
              </div>
              <div className="rounded-md bg-surface px-4 py-3">
                <p className="text-xs text-muted-foreground">Balance</p>
                <p className="heading1 tabular-nums">{wallet.balanceDrops ? formatXrp(wallet.balanceDrops) : "—"}</p>
              </div>
              {wallet.networkError && (
                <Alert variant="destructive"><AlertTitle>Signing blocked</AlertTitle><AlertDescription>{wallet.networkError}</AlertDescription></Alert>
              )}
              <Button variant="outline" className="w-full" onClick={() => { wallet.disconnect(); closePanel(true); }}><LogOut /> Disconnect</Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="font-medium">Local development wallet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Keys stay in this browser session. The shared market receives public data and signatures only. Signing is refused unless the node reports network 4001.
                </p>
              </div>
              <Button className="w-full" aria-busy={busy === "create"} disabled={busy !== null} onClick={() => run("create", () => wallet.createFundedWallet())}>
                {busy === "create" ? <LoaderCircle className="animate-spin motion-reduce:animate-none" /> : <Sparkles />} {busy === "create" ? "Funding from faucet…" : "Create a funded test wallet"}
              </Button>
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><Separator className="flex-1" /> or <Separator className="flex-1" /></div>
              <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void run("import", () => wallet.connectWithSeed(seed)); }}>
                <Label htmlFor="seed">Import a test seed</Label>
                <Input id="seed" type="password" autoComplete="off" placeholder="s…" value={seed} onChange={(e) => setSeed(e.target.value)} />
                <Button type="submit" variant="outline" className="w-full" aria-busy={busy === "import"} disabled={!seed || busy !== null}>{busy === "import" ? <LoaderCircle className="animate-spin motion-reduce:animate-none" /> : <KeyRound />} {busy === "import" ? "Checking…" : "Import"}</Button>
              </form>
              {wallet.error && (
                <Alert variant="destructive"><AlertTitle>Could not connect</AlertTitle><AlertDescription>{wallet.error}</AlertDescription></Alert>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
