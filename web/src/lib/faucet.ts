import { Wallet } from "xrpl";

export interface FaucetDependencies {
  faucetUrl: string;
  persistWallet: (wallet: Wallet) => void;
  accountExists: (address: string) => Promise<boolean>;
  isCurrent: () => boolean;
  fetcher?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
}

/** Persist a validated faucet wallet before any funding lookup can fail. No signer is activated. */
export async function requestFundedTestWallet(dependencies: FaucetDependencies): Promise<Wallet> {
  if (!dependencies.isCurrent()) throw new Error("Wallet operation cancelled.");
  const fetcher = dependencies.fetcher ?? fetch;
  const sleep = dependencies.sleep ?? ((milliseconds) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const response = await fetcher(dependencies.faucetUrl, {
    method: "POST", headers: { "content-type": "application/json" }, body: "{}", signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Faucet returned HTTP ${response.status}.`);
  const body = (await response.json()) as { account?: { address?: unknown; secret?: unknown } };
  if (typeof body.account?.secret !== "string" || typeof body.account.address !== "string") throw new Error("Faucet response did not include a valid account.");
  let wallet: Wallet;
  try { wallet = Wallet.fromSeed(body.account.secret); }
  catch { throw new Error("Faucet response included an invalid test wallet."); }
  if (wallet.classicAddress !== body.account.address) throw new Error("Faucet seed does not match its address.");
  if (!dependencies.isCurrent()) throw new Error("Wallet operation cancelled.");
  dependencies.persistWallet(wallet);

  try {
    for (let attempt = 0; attempt < 15; attempt++) {
      if (!dependencies.isCurrent()) throw new Error("Wallet operation cancelled.");
      const funded = await dependencies.accountExists(wallet.classicAddress);
      if (!dependencies.isCurrent()) throw new Error("Wallet operation cancelled.");
      if (funded) return wallet;
      if (attempt < 14) await sleep(1000);
    }
  } catch {
    if (!dependencies.isCurrent()) throw new Error("Wallet operation cancelled.");
    throw new Error("Funding verification was interrupted. Your test wallet is saved in this browser session. Reload to check it again; signing is still disabled.");
  }
  throw new Error("Faucet funding is not validated yet. Your test wallet is saved in this browser session. Reload later to check it again; signing is still disabled.");
}
