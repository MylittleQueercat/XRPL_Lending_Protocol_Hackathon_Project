"use client";

import * as React from "react";
import { readMarket, subscribeMarket, toDisplayOffer } from "@/lib/market-client";
import type { MarketSnapshot } from "@/lib/market-contract";

export function useMarket() {
  const [snapshot, setSnapshot] = React.useState<MarketSnapshot>({ offers: [], attempts: [] });
  const [ready, setReady] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const mounted = React.useRef(false);
  const active = React.useRef<Promise<void> | null>(null);
  const refresh = React.useCallback((): Promise<void> => {
    if (active.current) return active.current;
    setRefreshing(true);
    const pending = (async () => {
      try {
        const next = await readMarket();
        if (mounted.current) { setSnapshot(next); setError(null); }
      } catch (cause) {
        if (mounted.current) setError((cause as Error).message || "Cannot reach the shared marketplace. Refresh before continuing.");
      } finally {
        if (mounted.current) { setReady(true); setRefreshing(false); }
        active.current = null;
      }
    })();
    active.current = pending;
    return pending;
  }, []);
  React.useEffect(() => {
    mounted.current = true;
    void refresh();
    const update = () => void refresh();
    const unsubscribe = subscribeMarket(update);
    const interval = setInterval(update, 7_500);
    window.addEventListener("online", update);
    window.addEventListener("focus", update);
    return () => {
      mounted.current = false;
      unsubscribe(); clearInterval(interval);
      window.removeEventListener("online", update);
      window.removeEventListener("focus", update);
    };
  }, [refresh]);
  return { snapshot, ready, error, refreshing, refresh };
}

export function useOffers() {
  const market = useMarket();
  const offers = React.useMemo(() => market.snapshot.offers.map(toDisplayOffer).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)), [market.snapshot]);
  return { ...market, offers };
}
export function useOffer(id: string) {
  const market = useOffers();
  return { ...market, offer: market.offers.find((offer) => offer.id === id) ?? null, attempt: market.snapshot.attempts.find((attempt) => attempt.offerId === id) ?? null };
}
