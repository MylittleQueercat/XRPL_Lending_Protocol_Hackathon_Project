"use client";

import * as React from "react";
import { Copy, KeyRound, LogOut, Sparkles, Wallet as WalletIcon, Check, ExternalLink } from "lucide-react";
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

  React.useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

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
    await navigator.clipboard.writeText(wallet.account.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="relative" ref={panelRef}>
      <Button variant="secondary" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="dialog">
        <WalletIcon />
        {wallet.account ? <span className="font-mono">{shortAddress(wallet.account.address)}</span> : <><span className="hidden sm:inline">Connect wallet</span><span className="sm:hidden">Connect</span></>}
      </Button>

      {open && (
        <div role="dialog" aria-label="Wallet" className="absolute right-0 z-50 mt-3 w-[22rem] rounded-xl border border-border bg-popover p-5 text-popover-foreground shadow-[0_10px_20px_rgba(0,0,0,0.08)]">
          {wallet.account ? (
            <div className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground">{wallet.account.label} · local dev wallet</p>
                <div className="mt-1 flex items-center gap-2">
                  <code className="truncate text-sm">{wallet.account.address}</code>
                  <Button size="icon" variant="ghost" onClick={copy} aria-label="Copy address">{copied ? <Check /> : <Copy />}</Button>
                  <a href={explorerAccount(wallet.account.address)} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground" aria-label="Open in explorer"><ExternalLink className="size-4" /></a>
                </div>
              </div>
              <div className="rounded-md bg-surface px-4 py-3">
                <p className="text-xs text-muted-foreground">Balance</p>
                <p className="heading1 tabular-nums">{wallet.balanceDrops ? formatXrp(wallet.balanceDrops) : "—"}</p>
              </div>
              {wallet.networkError && (
                <Alert variant="destructive"><AlertTitle>Signing blocked</AlertTitle><AlertDescription>{wallet.networkError}</AlertDescription></Alert>
              )}
              <Button variant="outline" className="w-full" onClick={() => { wallet.disconnect(); setOpen(false); }}><LogOut /> Disconnect</Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="font-medium">Local development wallet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Keys stay in this browser session. The app has no server. Signing is refused unless the node reports network 4001.
                </p>
              </div>
              <Button className="w-full" disabled={busy !== null} onClick={() => run("create", () => wallet.createFundedWallet())}>
                <Sparkles /> {busy === "create" ? "Funding from faucet…" : "Create a funded test wallet"}
              </Button>
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><Separator className="flex-1" /> or <Separator className="flex-1" /></div>
              <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void run("import", () => wallet.connectWithSeed(seed)); }}>
                <Label htmlFor="seed">Import a test seed</Label>
                <Input id="seed" type="password" autoComplete="off" placeholder="s…" value={seed} onChange={(e) => setSeed(e.target.value)} />
                <Button type="submit" variant="outline" className="w-full" disabled={!seed || busy !== null}><KeyRound /> {busy === "import" ? "Checking…" : "Import"}</Button>
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
