"use client";

import * as React from "react";
import { ArrowRight, LoaderCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/lib/wallet";

// First screen for someone with no wallet: one button creates a funded test wallet, then the
// portfolio fills in. Importing an existing key stays available from the header.
export function NotConnected() {
  const wallet = useWallet();
  const [busy, setBusy] = React.useState(false);
  const create = async () => {
    setBusy(true);
    try { await wallet.createFundedWallet(); } catch { /* the wallet provider keeps the error */ } finally { setBusy(false); }
  };
  const steps = [
    ["1", "Put XRP in a vault", "You receive shares. The vault lends that money out and earns interest."],
    ["2", "Want your money back?", "If the vault has cash, you withdraw. If it is all out on loan, you sell your shares instead."],
    ["3", "Sell or buy a position", "Sellers name their price. Buyers pay less than the shares are worth and cash out when the loans repay."],
  ];
  return (
    <div className="mx-auto max-w-2xl space-y-6 py-6">
      <div className="text-center">
        <h2 className="text-2xl font-semibold tracking-tight">Try Raise with test XRP</h2>
        <p className="mt-2 text-sm text-muted-foreground">Everything runs on the XRP Ledger test network. Nothing here has real value, so try every button.</p>
        <div className="mt-5 flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
          <Button size="lg" disabled={busy || wallet.status === "connecting"} onClick={() => void create()}>
            {busy ? <LoaderCircle className="animate-spin" /> : <Sparkles />} {busy ? "Creating your wallet…" : "Create a test wallet"}
          </Button>
          <span className="text-xs text-muted-foreground">or import a key from the wallet button in the header</span>
        </div>
        {wallet.error && <p className="mt-3 text-sm text-destructive">{wallet.error}</p>}
      </div>
      <ol className="grid gap-3 sm:grid-cols-3">
        {steps.map(([n, title, body]) => (
          <li key={n} className="terminal-panel p-4">
            <span className="grid size-7 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">{n}</span>
            <p className="mt-3 text-sm font-semibold">{title}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{body}</p>
          </li>
        ))}
      </ol>
      <p className="flex items-center justify-center gap-1 text-xs text-muted-foreground">Every number on these screens is read from the ledger itself <ArrowRight className="size-3" /> nothing is simulated.</p>
    </div>
  );
}
