"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { shortHash } from "@/lib/format";
import { cn } from "@/lib/utils";
import { isVaultId } from "./known-vaults";

export function VaultSelector({ value, known, onSelect, disabled }: { value: string | null; known: string[]; onSelect: (vaultId: string) => void; disabled?: boolean }) {
  const [draft, setDraft] = React.useState("");
  const valid = isVaultId(draft);
  return (
    <div className="space-y-3">
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          onSelect(draft.trim().toUpperCase());
          setDraft("");
        }}
      >
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="vault-id">Vault ID</Label>
          <Input
            id="vault-id"
            className="font-mono"
            placeholder="64-character ledger index"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-invalid={draft.length > 0 && !valid}
            disabled={disabled}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <Button type="submit" variant="outline" disabled={!valid || disabled}>
          <Search /> Look up
        </Button>
      </form>
      {known.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">Recent:</span>
          {known.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              disabled={disabled}
              title={id}
              className={cn("rounded-md border px-2 py-0.5 font-mono transition-colors hover:bg-muted disabled:opacity-50", id === value ? "border-primary bg-primary/5 text-foreground" : "text-muted-foreground")}
            >
              {shortHash(id)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
