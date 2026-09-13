"use client";

import { Activity, AlertTriangle, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useWallet } from "@/lib/wallet";
import { TRACK1 } from "@/lib/network";

// Always visible in the header: which ledger the app is talking to, and whether it is the right one.
export function NetworkBadge() {
  const { network, networkError } = useWallet();
  if (!network && !networkError) return <Badge variant="outline" className="gap-1.5"><Activity className="animate-pulse" /> connecting…</Badge>;
  if (networkError || !network?.matches) {
    return (
      <Badge variant="destructive" className="gap-1.5" title={networkError ?? undefined}>
        {network ? <AlertTriangle /> : <WifiOff />}
        {network ? "wrong network" : "offline"}
      </Badge>
    );
  }
  return (
    <Badge variant="success" className="gap-1.5 font-mono" title={`${TRACK1.wsUrl} · rippled ${network.build} · ledger ${network.ledgerIndex} (${network.ledgerAgeSeconds}s)`}>
      <span className="size-1.5 rounded-full bg-success" />
      test ledger · #{network.ledgerIndex.toLocaleString("en-US")}
    </Badge>
  );
}
