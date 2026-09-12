// Vault IDs the user has looked at, kept in the browser so the selector has something to offer.
// There is no MPT-to-vault index on the ledger, so this is how a holding is mapped back to a vault.
export const KNOWN_VAULTS_KEY = "raise.knownVaults.v1";

export const isVaultId = (value: string) => /^[A-F0-9]{64}$/i.test(value.trim());

export function readKnownVaults(storage: Pick<Storage, "getItem"> | null): string[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(KNOWN_VAULTS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string" && isVaultId(v)).map((v) => v.toUpperCase()) : [];
  } catch {
    return [];
  }
}

export function rememberVault(storage: Pick<Storage, "getItem" | "setItem"> | null, vaultId: string): string[] {
  const id = vaultId.trim().toUpperCase();
  const next = [id, ...readKnownVaults(storage).filter((v) => v !== id)].slice(0, 12);
  try {
    storage?.setItem(KNOWN_VAULTS_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable; the in-memory list still drives the UI for this page.
  }
  return next;
}
