"use client";

import * as React from "react";
import { getOffer, listOffers, subscribeOffers, type Offer } from "@/lib/offers";

// Offers live in the browser store; these hooks keep a component in step with it, including changes
// made in another tab. `ready` is false during SSR and the first client render, so the page can
// render a skeleton instead of a misleading empty state.
export function useOffers(): { offers: Offer[]; ready: boolean } {
  const [offers, setOffers] = React.useState<Offer[]>([]);
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    const refresh = () => setOffers(listOffers());
    refresh();
    setReady(true);
    const unsubscribe = subscribeOffers(refresh);
    // Expiry is derived from the clock, so re-read periodically even without store events.
    const interval = setInterval(refresh, 30_000);
    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);
  return { offers, ready };
}

export function useOffer(id: string): { offer: Offer | null; ready: boolean } {
  const [offer, setOffer] = React.useState<Offer | null>(null);
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    const refresh = () => setOffer(getOffer(id) ?? null);
    refresh();
    setReady(true);
    const unsubscribe = subscribeOffers(refresh);
    const interval = setInterval(refresh, 30_000);
    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [id]);
  return { offer, ready };
}
