"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { routes } from "@/lib/network";

type CopyStatus = "idle" | "copying" | "copied" | "error";
const COPY_CONFIRMATION_MS = 2_500;

export function VaultIdentity({ vaultId }: { vaultId: string }) {
  const [copyStatus, setCopyStatus] = React.useState<CopyStatus>("idle");
  const helpId = React.useId();

  React.useEffect(() => {
    if (copyStatus !== "copied") return;
    const timer = window.setTimeout(() => setCopyStatus("idle"), COPY_CONFIRMATION_MS);
    return () => window.clearTimeout(timer);
  }, [copyStatus]);

  async function copyVaultId() {
    setCopyStatus("copying");
    try {
      await navigator.clipboard.writeText(vaultId);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }
  }

  return (
    <div className="space-y-2 border-b border-border p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold">Vault ID</span>
        <Button
          variant="outline"
          size="sm"
          className="px-2.5 text-xs"
          onClick={() => void copyVaultId()}
          disabled={copyStatus === "copying"}
          aria-label="Copy Vault ID"
          aria-describedby={helpId}
        >
          {copyStatus === "copied" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copyStatus === "copied" ? "Copied" : copyStatus === "copying" ? "Copying…" : "Copy Vault ID"}
        </Button>
      </div>
      <code tabIndex={0} className="raise-focus block select-all break-all rounded-sm font-mono text-xs leading-relaxed">{vaultId}</code>
      <p id={helpId} className="text-xs leading-relaxed text-muted-foreground">
        This identifies the vault, not your wallet. Open it in <Link href={`${routes.portfolio}?vault=${encodeURIComponent(vaultId)}`} className="raise-focus rounded-sm text-primary underline underline-offset-2">Portfolio</Link> or <Link href={routes.sell({ vault: vaultId })} className="raise-focus rounded-sm text-primary underline underline-offset-2">Sell</Link>, or paste this ID into Add vault.
      </p>
      <p role="status" aria-live="polite" className={copyStatus === "error" ? "text-xs leading-relaxed text-destructive" : "sr-only"}>
        {copyStatus === "copied" ? "Vault ID copied to clipboard." : copyStatus === "error" ? "Clipboard access is unavailable. Select the full Vault ID above and copy it manually." : ""}
      </p>
    </div>
  );
}
