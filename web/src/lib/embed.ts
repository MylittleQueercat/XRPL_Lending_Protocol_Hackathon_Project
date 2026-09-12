/** Full-page host boundary prototype. No wallet material or cross-window transport. */
export interface EmbedLaunch {
  network: 4001;
  vaultId?: string;
}
export type EmbedQuery = Record<string, string | string[] | undefined>;

function vaultId(value: unknown): string {
  if (typeof value !== "string" || !/^[a-fA-F0-9]{64}$/.test(value)) throw new Error("Vault must be a 64-character hex ledger index.");
  return value.toUpperCase();
}

/** Next searchParams uses arrays for repeated query parameters. Reject ambiguity and extra data. */
export function parseEmbedQuery(query: EmbedQuery): EmbedLaunch {
  if (Object.keys(query).some((key) => key !== "network" && key !== "vault")) throw new Error("Embed accepts only network and optional vault parameters.");
  if (query.network !== "4001") throw new Error("Embed requires explicit network=4001.");
  return { network: 4001, ...(query.vault === undefined ? {} : { vaultId: vaultId(query.vault) }) };
}

/** Always relative to Raise. A caller cannot supply a redirect destination. */
export function embedDestination(launch: EmbedLaunch): string {
  if (launch.network !== 4001 || Object.keys(launch).some((key) => key !== "network" && key !== "vaultId")) throw new Error("Invalid Raise launch configuration.");
  return launch.vaultId === undefined ? "/position" : `/position?vault=${vaultId(launch.vaultId)}`;
}

/** raiseOrigin is an integrator-owned deployment setting, never a query parameter or user input. */
export function buildEmbedLink(raiseOrigin: string, launch: EmbedLaunch): string {
  embedDestination(launch);
  const origin = new URL(raiseOrigin);
  const localHttp = origin.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
  if (origin.origin !== raiseOrigin || origin.username || origin.password || (origin.protocol !== "https:" && !localHttp)) throw new Error("Configure an exact HTTPS Raise origin, or an HTTP loopback origin for development.");
  const url = new URL("/embed", origin);
  url.searchParams.set("network", "4001");
  if (launch.vaultId !== undefined) url.searchParams.set("vault", vaultId(launch.vaultId));
  return url.toString();
}

export type EmbedStatus = "ready" | "pending" | "complete" | "attention-required";
export interface EmbedNotification { type: "raise.status"; version: 1; status: EmbedStatus }

/**
 * Pure schema prototype: the caller must obtain a local user choice first. The launch URL cannot
 * grant consent. There is intentionally no postMessage, callback URL, event emitter or storage.
 */
export function createEmbedNotification(status: EmbedStatus, localOptIn: boolean): EmbedNotification | null {
  if (localOptIn !== true) return null;
  if (!["ready", "pending", "complete", "attention-required"].includes(status)) throw new Error("Unsupported generic status.");
  return { type: "raise.status", version: 1, status };
}
