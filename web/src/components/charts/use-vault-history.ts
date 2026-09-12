"use client";

import * as React from "react";
import { readVault } from "@/lib/ledger";
import { sampleFromVault, sampleVaultHistory, type SampleOptions, type VaultSample } from "@/lib/history";

export type HistoryStatus = "idle" | "loading" | "ready" | "error";

interface Entry { samples: VaultSample[]; loadedAt: number }
// Shared across screens for the life of the page, so switching between portfolio and operator
// does not re-sample the ledger. Live polls append to it.
const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<VaultSample[]>>();

function backfill(vaultId: string, options?: SampleOptions): Promise<VaultSample[]> {
  const pending = inflight.get(vaultId);
  if (pending) return pending;
  const task = sampleVaultHistory(vaultId, options).then((samples) => {
    cache.set(vaultId, { samples, loadedAt: Date.now() });
    return samples;
  }).finally(() => inflight.delete(vaultId));
  inflight.set(vaultId, task);
  return task;
}

export function appendLiveSample(vaultId: string, sample: VaultSample): VaultSample[] {
  const entry = cache.get(vaultId) ?? { samples: [], loadedAt: Date.now() };
  const last = entry.samples[entry.samples.length - 1];
  if (last && last.ledgerIndex >= sample.ledgerIndex) return entry.samples;
  const samples = [...entry.samples, sample].slice(-600);
  cache.set(vaultId, { samples, loadedAt: entry.loadedAt });
  return samples;
}

// Real history of a vault's NAV per share, assets and cash, then live updates while mounted.
export function useVaultHistory(vaultId: string | null, options: SampleOptions & { pollMs?: number } = {}) {
  const [samples, setSamples] = React.useState<VaultSample[]>(() => (vaultId && cache.get(vaultId)?.samples) || []);
  const [status, setStatus] = React.useState<HistoryStatus>(vaultId && cache.has(vaultId) ? "ready" : "idle");
  const [error, setError] = React.useState<string | null>(null);
  const { points, spanLedgers, concurrency, pollMs = 10_000 } = options;

  const refresh = React.useCallback(async () => {
    if (!vaultId) return;
    setStatus("loading");
    setError(null);
    try {
      setSamples(await backfill(vaultId, { points, spanLedgers, concurrency }));
      setStatus("ready");
    } catch (cause) {
      setError((cause as Error).message);
      setStatus("error");
    }
  }, [vaultId, points, spanLedgers, concurrency]);

  React.useEffect(() => {
    if (!vaultId) { setSamples([]); setStatus("idle"); return; }
    const cached = cache.get(vaultId);
    if (cached) { setSamples(cached.samples); setStatus("ready"); }
    else void refresh();
  }, [vaultId, refresh]);

  React.useEffect(() => {
    if (!vaultId || pollMs <= 0) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const vault = await readVault(vaultId);
        if (cancelled) return;
        setSamples(appendLiveSample(vaultId, sampleFromVault(vault)));
      } catch {
        // A failed poll leaves the series as it was; the next tick tries again.
      }
    };
    const interval = setInterval(() => void tick(), pollMs);
    return () => { cancelled = true; clearInterval(interval); };
  }, [vaultId, pollMs]);

  const latest = samples[samples.length - 1] ?? null;
  const first = samples[0] ?? null;
  return { samples, latest, first, status, error, refresh };
}
