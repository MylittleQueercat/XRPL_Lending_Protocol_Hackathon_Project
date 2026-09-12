"use client";

import * as React from "react";
import { readVault } from "@/lib/ledger";
import { sampleFromVault, sampleVaultHistory, type VaultSample } from "@/lib/history";

// A quote for one vault on the Market Watch: its recent NAV-per-share history from the validated
// ledger and the latest sample, refreshed by one shared poll for every listed vault.
export type VaultQuote =
  | { status: "loading"; samples: VaultSample[]; latest: null }
  | { status: "ready"; samples: VaultSample[]; latest: VaultSample }
  | { status: "error"; samples: VaultSample[]; latest: null; message: string };

export function useVaultQuotes(vaultIds: string[], { points = 24, spanLedgers = 6_000, pollMs = 15_000 } = {}): Record<string, VaultQuote> {
  const [quotes, setQuotes] = React.useState<Record<string, VaultQuote>>({});
  const requested = React.useRef(new Set<string>());
  const mounted = React.useRef(false);
  const key = Array.from(new Set(vaultIds)).sort().join(",");

  React.useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  React.useEffect(() => {
    for (const id of key.split(",").filter(Boolean)) {
      if (requested.current.has(id)) continue;
      requested.current.add(id);
      setQuotes((prev) => ({ ...prev, [id]: { status: "loading", samples: [], latest: null } }));
      sampleVaultHistory(id, { points, spanLedgers })
        .then((samples) => {
          if (!mounted.current) return;
          const latest = samples[samples.length - 1];
          setQuotes((prev) => ({ ...prev, [id]: latest ? { status: "ready", samples, latest } : { status: "error", samples: [], latest: null, message: "Vault not found on the validated ledger." } }));
        })
        .catch((error: Error) => {
          if (mounted.current) setQuotes((prev) => ({ ...prev, [id]: { status: "error", samples: [], latest: null, message: error.message } }));
        });
    }
  }, [key, points, spanLedgers]);

  // One interval for every vault: read the current state and append it when the ledger moved.
  React.useEffect(() => {
    if (pollMs <= 0 || !key) return;
    const ids = key.split(",").filter(Boolean);
    const tick = async () => {
      await Promise.all(ids.map(async (id) => {
        try {
          const vault = await readVault(id);
          if (!mounted.current) return;
          const sample = sampleFromVault(vault);
          setQuotes((prev) => {
            const current = prev[id];
            if (!current || current.status !== "ready") return prev;
            if (current.latest.ledgerIndex >= sample.ledgerIndex) return prev;
            const samples = [...current.samples, sample].slice(-200);
            return { ...prev, [id]: { status: "ready", samples, latest: sample } };
          });
        } catch {
          // A failed poll leaves the quote as it was; the next tick tries again.
        }
      }));
    };
    const interval = setInterval(() => void tick(), pollMs);
    return () => clearInterval(interval);
  }, [key, pollMs]);

  return quotes;
}
