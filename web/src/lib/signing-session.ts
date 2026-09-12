import type { Wallet } from "xrpl";

// In-memory boundary shared by the wallet provider and transaction submission adapters.
let current: Wallet | null = null;
export function setActiveSigner(wallet: Wallet | null): void { current = wallet; }
export function assertActiveSigner(wallet: Wallet): void {
  if (current !== wallet) throw new Error("Wallet disconnected or changed while preparing. Nothing was signed. Reconnect and review the action.");
}
