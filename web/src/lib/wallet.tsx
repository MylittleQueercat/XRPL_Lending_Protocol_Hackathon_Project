"use client";

// Wallet for the Track 1 hackathon network (issue #18).
//
// This demo uses xrpl.js local signing for LoanSet counter-signatures and Batch signatures on
// the event's custom network. The secondary sale connects buyer and seller in separate browsers;
// the operator console retains a separate, explicitly labeled borrower co-sign demo limitation.
//
// This is the frontend of the wallet boundary defined at the repo root (src/wallet.ts,
// docs/WALLET.md, issue #18): same decision, same network guard, same rule that no seed ever
// reaches a server. The root module enumerates the required signing surface
// (REQUIRED_SIGNING_SURFACE) and the error codes DISCONNECTED / WRONG_NETWORK /
// UNSUPPORTED_TRANSACTION / SIGNING_REJECTED / SIGNING_FAILED; the messages thrown below map onto
// them one for one so a future connector can be swapped in behind the same UI.
//
// Rules the provider enforces:
//   - the seed lives in sessionStorage only and is never sent anywhere; only public data and signatures reach the shared market server
//   - every signature is refused unless the connected node reports network ID 4001
//   - disconnecting wipes the seed from memory and storage
import * as React from "react";
import { Wallet } from "xrpl";
import { TRACK1 } from "./network";
import { setActiveSigner } from "./signing-session";
import { requestFundedTestWallet } from "./faucet";
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
  // Operator-only LoanSet demo seam. The marketplace never requests a counterparty seed.
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
  const generation = React.useRef(0);
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

  const adopt = React.useCallback(async (wallet: Wallet, label: string, expectedGeneration: number) => {
    const balance = await readXrpBalance(wallet.classicAddress);
    if (generation.current !== expectedGeneration) throw new Error("Wallet operation cancelled. Reconnect to continue.");
    walletRef.current = wallet;
    setActiveSigner(wallet);
    setAccount({ address: wallet.classicAddress, publicKey: wallet.publicKey, kind: "local-dev", label });
    saveStored({ seed: wallet.seed as string, label });
    setBalance(balance);
    setStatus("connected");
    setError(null);
  }, []);

  const connectWithSeed = React.useCallback(async (seed: string, label = "Imported wallet") => {
    const operation = ++generation.current;
    walletRef.current = null;
    setActiveSigner(null);
    setAccount(null);
    setBalance(null);
    saveStored(null);
    setStatus("connecting");
    setError(null);
    try {
      const wallet = Wallet.fromSeed(seed.trim());
      const net = await checkNetwork();
      if (!net?.matches) throw new Error(networkError ?? `Network mismatch: refusing to connect.`);
      if (!(await accountExists(wallet.classicAddress))) throw new Error("That account is not funded on this network.");
      await adopt(wallet, label, operation);
    } catch (cause) {
      if (generation.current !== operation) throw cause;
      walletRef.current = null;
      setActiveSigner(null);
      setStatus("error");
      setError((cause as Error).message);
      throw cause;
    }
  }, [adopt, checkNetwork, networkError]);

  const createFundedWallet = React.useCallback(async (label = "Test wallet") => {
    const operation = ++generation.current;
    walletRef.current = null;
    setActiveSigner(null);
    setAccount(null);
    setBalance(null);
    saveStored(null);
    setStatus("connecting");
    setError(null);
    try {
      const net = await checkNetwork();
      if (!net?.matches) throw new Error(`Network mismatch: refusing to create a wallet.`);
      const wallet = await requestFundedTestWallet({
        faucetUrl: TRACK1.faucetUrl,
        isCurrent: () => generation.current === operation,
        accountExists,
        persistWallet: (generated) => {
          // Funding reads can time out. Retain the verified wallet before the first read.
          const value = JSON.stringify({ seed: generated.seed as string, label });
          try {
            window.sessionStorage.setItem(STORAGE_KEY, value);
            if (window.sessionStorage.getItem(STORAGE_KEY) !== value) throw new Error("Storage did not retain the wallet.");
          } catch {
            throw new Error("Session storage cannot retain a test wallet. Signing remains disabled; enable session storage before creating another wallet.");
          }
        },
      });
      await adopt(wallet, label, operation);
    } catch (cause) {
      if (generation.current !== operation) throw cause;
      setStatus("error");
      setError((cause as Error).message);
      throw cause;
    }
  }, [adopt, checkNetwork]);

  const disconnect = React.useCallback(() => {
    generation.current++;
    walletRef.current = null;
    setActiveSigner(null);
    saveStored(null);
    setAccount(null);
    setBalance(null);
    setStatus("idle");
    setError(null);
  }, []);

  const refresh = React.useCallback(async () => {
    await checkNetwork();
    const current = walletRef.current;
    if (!current) return;
    try {
      const balance = await readXrpBalance(current.classicAddress);
      if (walletRef.current === current) setBalance(balance);
    } catch (cause) {
      if (walletRef.current === current) {
        setBalance(null);
        setNetworkError(`Cannot refresh wallet: ${(cause as Error).message}`);
      }
    }
  }, [checkNetwork]);

  const requireSigner = React.useCallback(async () => {
    if (!walletRef.current) throw new Error("Connect a wallet first.");
    const current = walletRef.current;
    const operation = generation.current;
    const net = await checkNetwork();
    if (generation.current !== operation || walletRef.current !== current) throw new Error("Wallet changed. Review this action and try again.");
    if (!net?.matches) throw new Error(`Refusing to sign: connected node reports network ${net?.networkId ?? "unknown"}, expected ${TRACK1.networkId}.`);
    if (!Number.isFinite(net.ledgerAgeSeconds) || net.ledgerAgeSeconds > 30) throw new Error("Refusing to sign against a stale validated ledger. Refresh the network and try again.");
    return current;
  }, [checkNetwork]);

  const signerForSeed = React.useCallback((seed: string) => Wallet.fromSeed(seed.trim()), []);

  // Restore a session wallet on load, then keep the network status fresh.
  React.useEffect(() => {
    let cancelled = false;
    const operation = generation.current;
    (async () => {
      await checkNetwork();
      const stored = loadStored();
      if (stored && !cancelled && generation.current === operation) {
        try {
          const restored = Wallet.fromSeed(stored.seed);
          if (!(await accountExists(restored.classicAddress))) throw new Error("Saved test wallet funding is still pending. Reload later to check again.");
          if (!cancelled) await adopt(restored, stored.label, operation);
        } catch (cause) {
          if (!cancelled && generation.current === operation) {
            setStatus("error");
            setError((cause as Error).message);
          }
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
