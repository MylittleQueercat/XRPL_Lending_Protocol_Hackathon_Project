// Track 1 hackathon network. Fixed on purpose: the app must never silently talk to another ledger.
export const TRACK1 = Object.freeze({
  name: "XRPL Lending Hackathon Devnet",
  networkId: 4001,
  wsUrl: "wss://lending-hackathon.dev.ripplex.io:51233",
  rpcUrl: "https://lending-hackathon.dev.ripplex.io:51234",
  faucetUrl: "https://lending-hackathon-faucet.dev.ripplex.io/accounts",
  explorerUrl: "https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233",
});

export const explorerTx = (hash: string) => `${TRACK1.explorerUrl}/transactions/${hash}`;
export const explorerAccount = (address: string) => `${TRACK1.explorerUrl}/accounts/${address}`;

// Routes are the contract between screens. Every screen links through these, never through
// hand-typed paths, so a route can move without breaking the others.
export const routes = Object.freeze({
  home: "/",
  // The portfolio terminal. /position stays as a redirect so old links and the embed prototype work.
  position: "/portfolio",
  portfolio: "/portfolio",
  market: "/market",
  offer: (id: string) => `/market/${id}`,
  sell: (params?: { vault?: string; shares?: string }) => {
    const query = new URLSearchParams();
    if (params?.vault) query.set("vault", params.vault);
    if (params?.shares) query.set("shares", params.shares);
    const suffix = query.toString();
    return suffix ? `/sell?${suffix}` : "/sell";
  },
  buy: (offerId: string) => `/buy/${offerId}`,
  operator: "/operator",
});
