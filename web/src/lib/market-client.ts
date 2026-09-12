import type { Wallet } from "xrpl";
import { sign } from "ripple-keypairs";
import type { MarketAction, MarketChallenge, MarketSnapshot, Offer as StoredOffer } from "./market-contract";
import { withDerivedState, type Offer } from "./offers";

const listeners = new Set<() => void>();
export function subscribeMarket(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function notifyMarket() { for (const listener of listeners) listener(); }

export function toDisplayOffer(offer: StoredOffer): Offer {
  const proof = offer.settlement?.proof;
  return withDerivedState({
    id: offer.id, network: offer.networkId, vaultId: offer.vaultId,
    shareMptId: offer.shareMptId, seller: offer.seller, shares: offer.sharesRaw,
    priceDrops: offer.priceDrops, createdAt: offer.createdAt, expiresAt: offer.expiresAt,
    state: offer.state,
    ...(proof && offer.settlement ? { settlement: { hash: proof.transactionHash, ledgerIndex: proof.ledgerIndex, buyer: offer.settlement.buyer } } : {}),
  });
}

async function request<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method: body === undefined ? "GET" : "POST", cache: "no-store",
    ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.headers.get("content-type")?.includes("application/json")) throw new Error(`The marketplace service is unavailable (HTTP ${response.status}). Please refresh when the service is ready.`);
  const payload = await response.json();
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : `Marketplace request failed (${response.status}).`);
  return payload as T;
}

export function readMarket(): Promise<MarketSnapshot> { return request("/api/market"); }

export async function performMarketAction(action: MarketAction, getSigner: () => Promise<Wallet>): Promise<MarketSnapshot> {
  const signer = await getSigner();
  const challenge = await request<MarketChallenge>("/api/market/challenge", { account: signer.classicAddress, action });
  validateMarketChallenge(challenge, action, signer.classicAddress, window.location.origin);
  const current = await getSigner();
  if (current.classicAddress !== signer.classicAddress) throw new Error("Wallet changed. Review this action again.");
  // This is an application authorization signature, never a payment transaction.
  const bytes = new TextEncoder().encode(challenge.message);
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  const signature = sign(hex, signer.privateKey);
  try {
    return await request<MarketSnapshot>("/api/market", { challengeId: challenge.id, publicKey: signer.publicKey, signature });
  } finally {
    // A timeout may occur after the server persisted the change. Refresh; never replay blindly.
    notifyMarket();
  }
}

export function validateMarketChallenge(challenge: MarketChallenge, action: MarketAction, account: string, origin: string) {
  const expiry = Date.parse(challenge.expiresAt);
  if (!Number.isFinite(expiry) || expiry <= Date.now() || expiry > Date.now() + 130_000) throw new Error("Marketplace authorization expired or has an invalid lifetime. Review and retry.");
  const intent = JSON.parse(challenge.message) as Record<string, unknown>;
  const canonical = (value: unknown): string => {
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(",")}}`;
    return JSON.stringify(value);
  };
  if (Object.keys(intent).sort().join(",") !== "account,action,domain,expiresAt,networkId,nonce,origin,version" || typeof intent.nonce !== "string" || intent.nonce !== challenge.id || intent.domain !== "Raise Marketplace Intent" || intent.version !== 1 || intent.origin !== origin || intent.networkId !== 4001 || intent.account !== account || intent.expiresAt !== challenge.expiresAt || canonical(intent.action) !== canonical(action)) {
    throw new Error("Marketplace authorization does not match the action you reviewed.");
  }
}
