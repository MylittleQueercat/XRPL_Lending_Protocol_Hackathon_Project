"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

export function VaultIdentity({ vaultId }: { vaultId: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");

  useEffect(() => {
    if (status !== "copied") return;
    const timer = setTimeout(() => setStatus("idle"), 2500);
    return () => clearTimeout(timer);
  }, [status]);

  async function copyId() {
    try {
      await navigator.clipboard.writeText(vaultId);
      setStatus("copied");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="space-y-2 border-t border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">Vault ID</span>
        <Button variant="outline" size="sm" onClick={() => void copyId()} aria-label={`Copy vault ID ${vaultId}`}>
          {status === "copied" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {status === "copied" ? "Copied" : "Copy Vault ID"}
        </Button>
      </div>
      <code className="block select-all break-all text-xs leading-relaxed">{vaultId}</code>
      <p role="status" aria-live="polite" className="text-xs text-muted-foreground">
        {status === "error" ? "Copy unavailable. Select the full ID above and copy it manually."
          : status === "copied" ? "Vault ID copied. Paste it in My position or Sell."
          : "Use this ID in My position or Sell. It is not your wallet address."}
      </p>
    </div>
  );
}
