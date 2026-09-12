"use client";

import * as React from "react";
import { readVault, type VaultState } from "@/lib/ledger";

export type VaultEntry = { status: "loading" } | { status: "ready"; vault: VaultState } | { status: "error"; message: string };

// Reads each distinct vault once from the validated ledger and caches it for the component's life.
// One vault failing must not take the others down, so errors are stored per id.
export function useVaults(vaultIds: string[]): Record<string, VaultEntry> {
  const [entries, setEntries] = React.useState<Record<string, VaultEntry>>({});
  const requested = React.useRef(new Set<string>());
  const key = vaultIds.slice().sort().join(",");

  React.useEffect(() => {
    let cancelled = false;
    for (const id of key.split(",").filter(Boolean)) {
      if (requested.current.has(id)) continue;
      requested.current.add(id);
      setEntries((prev) => ({ ...prev, [id]: { status: "loading" } }));
      readVault(id)
        .then((vault) => {
          if (!cancelled) setEntries((prev) => ({ ...prev, [id]: { status: "ready", vault } }));
        })
        .catch((error: Error) => {
          if (!cancelled) setEntries((prev) => ({ ...prev, [id]: { status: "error", message: error.message } }));
        });
    }
    return () => {
      cancelled = true;
    };
  }, [key]);

  return entries;
}
