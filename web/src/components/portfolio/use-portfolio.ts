"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { readShareHoldings, readVault, type ShareHolding, type VaultState } from "@/lib/ledger";
import { readMarket } from "@/lib/market-client";
import { isVaultId, readKnownVaults, rememberVault } from "@/components/position/known-vaults";
import { buildPosition, heldUnitsFor, unmappedHoldings, type Position } from "./portfolio-math";

export interface VaultRow {
  vaultId: string;
  position: Position | null; // null until the vault has been read
  error: string | null; // read failure, kept per vault so one bad id does not blank the terminal
}

export interface PortfolioData {
  known: string[];
  rows: VaultRow[];
  positions: Position[]; // mapped holdings with a non-zero balance
  holdings: ShareHolding[];
  unmapped: ShareHolding[];
  selectedId: string | null;
  selected: VaultRow | null;
  loading: boolean;
  loadedOnce: boolean;
  error: string | null;
  readAt: number | null;
  select: (vaultId: string) => void;
  addVault: (vaultId: string) => void;
  refresh: () => Promise<void>;
}

const POLL_MS = 15_000;

// Everything the terminal shows about the wallet's vaults, read from the validated ledger and
// re-read on a timer. The list of vaults is the union of what the browser remembers and the
// vault ids the caller adds; holdings come from the wallet's MPT objects.
export function usePortfolio(account: string | null): PortfolioData {
  const params = useSearchParams();
  const storage = typeof window === "undefined" ? null : window.localStorage;
  const [known, setKnown] = React.useState<string[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [holdings, setHoldings] = React.useState<ShareHolding[]>([]);
  const [vaults, setVaults] = React.useState<Record<string, { vault?: VaultState; error?: string }>>({});
  const [loading, setLoading] = React.useState(false);
  const [loadedOnce, setLoadedOnce] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [readAt, setReadAt] = React.useState<number | null>(null);
  const generation = React.useRef(0);

  // Pick up a vault from the URL once, then from the browser's history of looked-up vaults.
  React.useEffect(() => {
    const stored = readKnownVaults(storage);
    const fromUrl = params.get("vault");
    if (fromUrl && isVaultId(fromUrl)) {
      setKnown(rememberVault(storage, fromUrl));
      setSelectedId(fromUrl.trim().toUpperCase());
    } else {
      setKnown(stored);
      setSelectedId((current) => current ?? stored[0] ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const refresh = React.useCallback(async () => {
    if (!account) return;
    const run = ++generation.current;
    setLoading(true);
    setError(null);
    try {
      const [all, reads] = await Promise.all([
        readShareHoldings(account),
        Promise.all(known.map(async (id) => {
          try { return [id, { vault: await readVault(id) }] as const; }
          catch (cause) { return [id, { error: (cause as Error).message }] as const; }
        })),
      ]);
      if (run !== generation.current) return;
      setHoldings(all);
      setVaults(Object.fromEntries(reads));
      setReadAt(Date.now());
    } catch (cause) {
      if (run !== generation.current) return;
      setError((cause as Error).message);
    } finally {
      if (run === generation.current) { setLoading(false); setLoadedOnce(true); }
    }
  }, [account, known]);

  React.useEffect(() => {
    if (!account) { setHoldings([]); setVaults({}); setLoadedOnce(false); setReadAt(null); return; }
    void refresh();
    const interval = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(interval);
  }, [account, refresh]);

  const rows = React.useMemo<VaultRow[]>(() => known.map((vaultId) => {
    const entry = vaults[vaultId];
    return {
      vaultId,
      position: entry?.vault ? buildPosition(entry.vault, heldUnitsFor(entry.vault, holdings)) : null,
      error: entry?.error ?? null,
    };
  }), [known, vaults, holdings]);

  const positions = React.useMemo(() => rows.flatMap((r) => (r.position && BigInt(r.position.heldUnits || "0") > 0n ? [r.position] : [])), [rows]);
  const unmapped = React.useMemo(() => unmappedHoldings(holdings, rows.flatMap((r) => (r.position ? [r.position.vault] : []))), [holdings, rows]);

  // A holding bought on the market arrives without its vault id (there is no MPT-to-vault index on
  // the ledger). The shared marketplace knows the pairing for every listed issuance, so use it.
  React.useEffect(() => {
    if (unmapped.length === 0) return;
    let cancelled = false;
    readMarket().then((snapshot) => {
      if (cancelled) return;
      for (const holding of unmapped) {
        const match = snapshot.offers.find((offer) => offer.shareMptId === holding.shareMptId);
        if (match && isVaultId(match.vaultId)) setKnown(rememberVault(storage, match.vaultId));
      }
    }).catch(() => { /* The hint to paste the vault id stays visible. */ });
    return () => { cancelled = true; };
  }, [unmapped, storage]);

  // With nothing chosen, land on the first vault the wallet actually holds shares of.
  React.useEffect(() => {
    if (selectedId || positions.length === 0) return;
    setSelectedId(positions[0].vault.vaultId);
  }, [selectedId, positions]);

  const select = React.useCallback((vaultId: string) => {
    const id = vaultId.trim().toUpperCase();
    setKnown(rememberVault(storage, id));
    setSelectedId(id);
  }, [storage]);

  const selected = rows.find((r) => r.vaultId === selectedId) ?? null;

  return { known, rows, positions, holdings, unmapped, selectedId, selected, loading, loadedOnce, error, readAt, select, addVault: select, refresh };
}
