import { afterAll, describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { Wallet } from "xrpl";
import { TRACK1, explorerTx } from "@/lib/network";
import { accountExists, disconnect, readNetworkStatus, readXrpBalance, signAndSubmit } from "@/lib/ledger";

// Issue #18, criterion 4: "verify it with a real signed test transaction". The browser wallet
// signs through signAndSubmit in src/lib/ledger.ts; this exercises exactly that function against
// the live hackathon ledger, with a faucet wallet created the same way the UI creates one.
async function fundedWallet(): Promise<Wallet> {
  const response = await fetch(TRACK1.faucetUrl, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  if (!response.ok) throw new Error(`Faucet HTTP ${response.status}`);
  const body = (await response.json()) as { account?: { address?: string; secret?: string } };
  if (!body.account?.secret) throw new Error("Faucet returned no seed");
  const wallet = Wallet.fromSeed(body.account.secret);
  for (let i = 0; i < 30 && !(await accountExists(wallet.classicAddress)); i++) await new Promise((r) => setTimeout(r, 1000));
  return wallet;
}

describe("local dev wallet signs a real transaction on network 4001", () => {
  afterAll(async () => { await disconnect(); });

  it("refuses to sign unless the node reports network 4001, then signs and validates a payment", async () => {
    const status = await readNetworkStatus();
    expect(status.networkId).toBe(TRACK1.networkId);
    expect(status.matches).toBe(true);

    const sender = await fundedWallet();
    const receiver = await fundedWallet();
    const before = await readXrpBalance(receiver.classicAddress);

    const result = await signAndSubmit({ TransactionType: "Payment", Account: sender.classicAddress, Destination: receiver.classicAddress, Amount: "1000000" }, sender);
    expect(result.validated).toBe(true);
    expect(result.resultCode).toBe("tesSUCCESS");
    expect(result.hash).toMatch(/^[A-F0-9]{64}$/);

    const after = await readXrpBalance(receiver.classicAddress);
    expect(BigInt(after) - BigInt(before)).toBe(1_000_000n);

    // Sanitised evidence: addresses and hash only, never seeds.
    mkdirSync("../evidence", { recursive: true });
    writeFileSync("../evidence/web-wallet-signing.json", JSON.stringify({
      status: "verified",
      scope: "Local development wallet signing path (web/src/lib/ledger.ts signAndSubmit) validated on the hackathon ledger.",
      completedAt: new Date().toISOString(),
      network: { networkId: status.networkId, build: status.build, ledgerIndex: status.ledgerIndex },
      accounts: { sender: sender.classicAddress, receiver: receiver.classicAddress },
      transaction: { type: "Payment", amountDrops: "1000000", hash: result.hash, ledgerIndex: result.ledgerIndex, resultCode: result.resultCode, explorer: explorerTx(result.hash) },
      receiverBalanceDrops: { before, after },
      environment: { xrpl: "5.2.0-beta.1", node: process.version },
    }, null, 2) + "\n");
  });
});
