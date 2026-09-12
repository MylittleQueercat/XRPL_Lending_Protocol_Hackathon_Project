"use client";

// Wallet for the Track 1 hackathon network (issue #18).
//
// Why a local development wallet, and not a browser extension: the flows this product needs —
// LoanSet with a counterparty signature, and an all-or-nothing Batch where the buyer signs an inner
// leg — are not exposed by Xaman, Crossmark or GemWallet, and none of them speaks to a custom
// devnet with network ID 4001. So signing happens here, in the browser, with xrpl.js.
//
// Rules the provider enforces:
//   - the seed lives in sessionStorage only and is never sent anywhere; the app has no server
//   - every signature is refused unless the connected node reports network ID 4001
//   - disconnecting wipes the seed from memory and storage
import * as React from "react";
import { Wallet } from "xrpl";
import { TRACK1 } from "./network";
import { accountExists, readNetworkStatus, readXrpBalance, type NetworkStatus } from "./ledger";

export type WalletKind = "local-dev";

export interface WalletAccount {
  address: string;
  publicKey: string;
  kind: WalletKind;
  label: string;
}

export interface WalletContextValue {
  account: WalletAccount | null;
  network: NetworkStatus | null;
  networkError: string | null;
  balanceDrops: string | null;
  status: "idle" | "connecting" | "connected" | "error";
  error: string | null;
  connectWithSeed: (seed: string, label?: string) => Promise<void>;
  createFundedWallet: (label?: string) => Promise<void>;
  disconnect: () => void;
  refresh: () => Promise<void>;
  // Returns the signing wallet only while the network matches. Screens call this at the moment of
  // signing, never earlier, so a network change between render and click is still caught.
  requireSigner: () => Promise<Wallet>;
  // Exposed so a demo can drive both sides of a two-party transaction from one browser.
  signerForSeed: (seed: string) => Wallet;
}

const WalletContext = React.createContext<WalletContextValue | null>(null);
const STORAGE_KEY = "raise.wallet.local.v1";

interface StoredWallet {
  seed: string;
  label: string;
}

function loadStored(): StoredWallet | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredWallet) : null;
  } catch {
    return null;
  }
}

function saveStored(value: StoredWallet | null) {
  try {
    if (value) window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable: the wallet still works for this page lifetime.
  }
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const walletRef = React.useRef<Wallet | null>(null);
  const [account, setAccount] = React.useState<WalletAccount | null>(null);
  const [network, setNetwork] = React.useState<NetworkStatus | null>(null);
  const [networkError, setNetworkError] = React.useState<string | null>(null);
  const [balanceDrops, setBalance] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<WalletContextValue["status"]>("idle");
  const [error, setError] = React.useState<string | null>(null);

  const checkNetwork = React.useCallback(async () => {
    try {
      const next = await readNetworkStatus();
      setNetwork(next);
      setNetworkError(next.matches ? null : `Connected node reports network ${next.networkId}; this app only signs for ${TRACK1.networkId}.`);
      return next;
    } catch (cause) {
      setNetwork(null);
      setNetworkError(`Cannot reach ${TRACK1.name}: ${(cause as Error).message}`);
      return null;
    }
  }, []);

  const adopt = React.useCallback(async (wallet: Wallet, label: string) => {
    walletRef.current = wallet;
    setAccount({ address: wallet.classicAddress, publicKey: wallet.publicKey, kind: "local-dev", label });
    saveStored({ seed: wallet.seed as string, label });
    setBalance(await readXrpBalance(wallet.classicAddress));
    setStatus("connected");
    setError(null);
  }, []);

  const connectWithSeed = React.useCallback(async (seed: string, label = "Imported wallet") => {
    setStatus("connecting");
    setError(null);
    try {
      const wallet = Wallet.fromSeed(seed.trim());
      const net = await checkNetwork();
      if (!net?.matches) throw new Error(networkError ?? `Network mismatch: refusing to connect.`);
      if (!(await accountExists(wallet.classicAddress))) throw new Error("That account is not funded on this network.");
      await adopt(wallet, label);
    } catch (cause) {
      walletRef.current = null;
      setStatus("error");
      setError((cause as Error).message);
      throw cause;
    }
  }, [adopt, checkNetwork, networkError]);

  const createFundedWallet = React.useCallback(async (label = "Test wallet") => {
    setStatus("connecting");
    setError(null);
    try {
      const net = await checkNetwork();
      if (!net?.matches) throw new Error(`Network mismatch: refusing to create a wallet.`);
      // The event faucet generates the account itself and returns its seed. It is only ever held
      // client-side from here on.
      const response = await fetch(TRACK1.faucetUrl, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      if (!response.ok) throw new Error(`Faucet returned HTTP ${response.status}.`);
      const body = (await response.json()) as { account?: { address?: string; secret?: string } };
      if (!body.account?.secret || !body.account.address) throw new Error("Faucet response did not include an account.");
      const wallet = Wallet.fromSeed(body.account.secret);
      if (wallet.classicAddress !== body.account.address) throw new Error("Faucet seed does not match its address.");
      // Funding is validated a ledger or two later; wait for it rather than showing a phantom account.
      for (let attempt = 0; attempt < 30; attempt++) {
        if (await accountExists(wallet.classicAddress)) break;
        await new Promise((r) => setTimeout(r, 1000));
      }
      await adopt(wallet, label);
    } catch (cause) {
      setStatus("error");
      setError((cause as Error).message);
      throw cause;
    }
  }, [adopt, checkNetwork]);

  const disconnect = React.useCallback(() => {
    walletRef.current = null;
    saveStored(null);
    setAccount(null);
    setBalance(null);
    setStatus("idle");
    setError(null);
  }, []);

  const refresh = React.useCallback(async () => {
    await checkNetwork();
    if (walletRef.current) setBalance(await readXrpBalance(walletRef.current.classicAddress));
  }, [checkNetwork]);

  const requireSigner = React.useCallback(async () => {
    if (!walletRef.current) throw new Error("Connect a wallet first.");
    const net = await checkNetwork();
    if (!net?.matches) throw new Error(`Refusing to sign: connected node reports network ${net?.networkId ?? "unknown"}, expected ${TRACK1.networkId}.`);
    return walletRef.current;
  }, [checkNetwork]);

  const signerForSeed = React.useCallback((seed: string) => Wallet.fromSeed(seed.trim()), []);

  // Restore a session wallet on load, then keep the network status fresh.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      await checkNetwork();
      const stored = loadStored();
      if (stored && !cancelled) {
        try {
          await adopt(Wallet.fromSeed(stored.seed), stored.label);
        } catch {
          saveStored(null);
        }
      }
    })();
    const interval = setInterval(() => void refresh(), 15_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [adopt, checkNetwork, refresh]);

  const value = React.useMemo<WalletContextValue>(
    () => ({ account, network, networkError, balanceDrops, status, error, connectWithSeed, createFundedWallet, disconnect, refresh, requireSigner, signerForSeed }),
    [account, network, networkError, balanceDrops, status, error, connectWithSeed, createFundedWallet, disconnect, refresh, requireSigner, signerForSeed],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = React.useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside <WalletProvider>.");
  return ctx;
}
