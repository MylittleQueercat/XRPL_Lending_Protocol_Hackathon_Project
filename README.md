# Raise — XRPL vault-share liquidity

Raise proposes a secondary market where an investor can sell existing vault shares to another investor when the vault has insufficient cash for a withdrawal. The buyer pays the seller and takes over the share exposure; the underlying loans continue. A buyer and an agreed price are required: liquidity and returns are not guaranteed.

**This repository is Step 1: the shared technical foundation targeting Track 1 Vanilla.** It includes a reproducible TypeScript environment, network checks, a real XLS-65 vault smoke test, automated tests and the team roadmap. Full XLS-66 lending and the marketplace are subsequent milestones, not implemented features.

- [Project concept — English team discussion document](docs/PROJECT_CONCEPT.md)
- [Shared team board](https://github.com/users/MylittleQueercat/projects/1)
- [Detailed roadmap](docs/ROADMAP.md)
- [32 unassigned project issues](https://github.com/MylittleQueercat/XRPL_Lending_Protocol_Hackathon_Project/issues?q=is%3Aissue+label%3Aroadmap)
- [Six milestones](https://github.com/MylittleQueercat/XRPL_Lending_Protocol_Hackathon_Project/milestones)
- [How teammates can contribute](CONTRIBUTING.md)

## Current network finding

On September 12, 2026, the event endpoint reported network **4001**, rippled **3.4.0-rc1**, and **SingleAssetVault, LendingProtocol and LendingProtocolV1_1 enabled**. HTTP and WebSocket requests succeeded. [V1.1 documentation](https://opensource.ripple.com/docs/lending-protocol-v1-1) restricts new loans to closed-ended vaults, which conflicts with the intended Track 1 open-ended lending flow.

`npm run doctor` therefore exits **2** to distinguish a reachable network from a compatible lending environment. `npm run vanilla` refuses to proceed and also explains that the complete lending flow is not yet implemented. Resolving [issue #2](https://github.com/MylittleQueercat/XRPL_Lending_Protocol_Hackathon_Project/issues/2) is a prerequisite for loan origination. This does not prevent the separate XLS-65 vault smoke test.

Do not silently substitute public Testnet, public Devnet or mainnet. Network configuration is deliberately fixed in `src/core.ts`; conflicting `XRPL_*` environment overrides are rejected. If event guidance changes, update configuration, evidence and tests together through review.

## Setup

Install Node.js **24** and Git. Verification used Node **24.11.1**. If you use nvm, `nvm install` and `nvm use` read `.nvmrc`.

```sh
git clone https://github.com/MylittleQueercat/XRPL_Lending_Protocol_Hackathon_Project.git
cd XRPL_Lending_Protocol_Hackathon_Project
npm ci
npm run check
npm run doctor
```

No API key or `.env` file is required. The SDK is pinned to **xrpl.js 5.2.0-beta.1** with a committed lockfile, following the September 12 event update supplied to the team. `npm run check` runs strict type checking and offline tests; it does not contact the network or create wallets. CI repeats these checks and dependency auditing.

| Target | Value |
|---|---|
| Track | 1: open-ended vault, Lending Protocol V1 target |
| Flavour | Vanilla foundation; no Loaded claim |
| Network ID | 4001, event network |
| JSON-RPC | `https://lending-hackathon.dev.ripplex.io:51234` |
| WebSocket | `wss://lending-hackathon.dev.ripplex.io:51233` |
| Faucet | `https://lending-hackathon-faucet.dev.ripplex.io/accounts` |
| Asset | Faucet-funded test XRP |

The refreshed Notion copy still listed stable xrpl.js for Track 1 and beta.0 for Track 2 when this pin was updated; the explicit team update points to [5.2.0-beta.1 on npm](https://www.npmjs.com/package/xrpl/v/5.2.0-beta.1). Updating the client library does not change the selected track or the amendments enabled on the ledger.

## Commands

| Command | Behavior |
|---|---|
| `npm run check` | Typecheck and offline tests. |
| `npm run doctor` | Read HTTP/WebSocket server information and amendments; check network, synchronization and ledger freshness. Exit 0 when compatible, 2 when reachable but incompatible, 1 on error. |
| `npm run vault:smoke` | Create two fresh faucet wallets, create a transferable XRP vault, deposit 10 XRP, withdraw 10 XRP, and verify validated results and balances. Sends test-network transactions. |
| `npm run vanilla` | Check Track 1 prerequisites and report the pending lending milestone. It does not implement or silently substitute a full loan flow. |
| `npm audit` | Check installed dependencies for known advisories. |

Run the smoke explicitly when you want new test accounts and ledger objects:

```sh
npm run vault:smoke
```

Every invocation creates fresh test wallets. It leaves the empty vault and test accounts on the event ledger after verification. It does not remove objects or reclaim account reserves. The checked run charged 2 test XRP for `VaultCreate`, plus 12 drops each for deposit and withdrawal; current fees are autofilled from the network.

The event faucet returns its own `account.address` and `account.secret`; it does not honor a destination address as expected by the usual funding flow. The adapter verifies that the returned seed derives the returned address, saves the wallet locally, and checks the funded balance on the selected network. It never logs the faucet response or seeds.

Secrets and run details are stored under ignored `.local/` directories with directory mode `0700` and file mode `0600` on Unix. Keep these files local. For an ambiguous submission, inspect the saved transaction-intent hash and query its outcome before retrying; the CLI does not blindly resubmit signed transactions. A new smoke invocation creates a separate run rather than resuming the previous one.

## Verified ledger evidence

The SDK update was also checked with a fresh [xrpl.js 5.2.0-beta.1 smoke report](evidence/vault-smoke-beta.1.json): creation, a 10 XRP deposit and full withdrawal all validated successfully. Exact SDK version, transaction hashes, ledger indexes and balance snapshots are in the report. The original evidence below is retained with its actual 5.2.0 version.

The original [sanitized smoke report](evidence/vault-smoke.json), produced with xrpl.js 5.2.0, records three validated `tesSUCCESS` transactions and exact before/after values:

| Operation | Ledger | Transaction |
|---|---:|---|
| `VaultCreate` | 65163 | [70740BF4…](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/70740BF4500A9E37C5AFAAA0706FB74F2D5EE38787EC150404088E62A473BF56) |
| `VaultDeposit` | 65165 | [76F408DE…](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/76F408DE062E73ABD5738AB733F952599045694A7C720A13ADC5E476A7D2390B) |
| `VaultWithdraw` | 65167 | [DD1BCC04…](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/DD1BCC04E48B181A18DFC260F109076FCE77808DA27E97076001CA5D35746D63) |

The deposit created **10,000,000 raw share units** and 10 XRP of available vault assets. Withdrawal returned 10 XRP and left share supply and vault assets at zero. The lender's net balance change was 24 drops in fees. Share transferability was read from the actual issuance flags; a transfer to a buyer is still future work. The raw unit ratio in this empty-vault example is not a universal pricing rule.

This proves **XLS-65 only**. It does not prove a loan, earned yield, the insufficient-liquidity guardrail or a completed secondary sale. The run occurred while V1.1 was enabled and is not evidence of V1 whole-life accounting. Event ledgers may reset; the checked report retains hashes and ledger indexes even if an explorer later loses history.

## Next steps

1. Resolve the Track 1 endpoint/amendment mismatch and agree the borrower use case.
2. Complete broker creation, a borrower-accepted funded loan, repayment, the liquidity rejection and capital-plus-yield redemption.
3. Prove transfer to a new shareholder and select a supported payment-for-shares settlement mechanism.
4. Build the investor, market, seller, buyer and operator journeys on those proofs.
5. Verify the integrated flow and prepare the manual DevEx report, presentation and submission.
6. Consider Loaded and broader market features after the core flow works.

The [roadmap](docs/ROADMAP.md) gives acceptance criteria and dependency links through repository issues. All issues are initially unassigned. Teammates can add proposals from **Issues → New issue**. The [shared board](https://github.com/users/MylittleQueercat/projects/1) is linked to this repository and contains all 32 roadmap issues. All four current repository collaborators have Project access. Use Backlog, Ready, In progress, In review, Blocked and Done; check dependencies before moving a task to Ready.

## Official references

- [Hackathon instructions](https://app.notion.com/p/adam-hn/XRPL-Lending-Protocol-Hackathon-5cc7508f4cdc83a7991e01f90528e490)
- [XLS-65 Single Asset Vault](https://github.com/XRPLF/XRPL-Standards/tree/master/XLS-0065-single-asset-vault)
- [XLS-66 Lending Protocol](https://github.com/XRPLF/XRPL-Standards/tree/master/XLS-0066-lending-protocol)
- [Lending Protocol V1.1](https://opensource.ripple.com/docs/lending-protocol-v1-1)
- [VaultCreate reference](https://xrpl.org/docs/references/protocol/transactions/types/vaultcreate)
- [Reference lending application](https://github.com/ripple/xrpl-reference-app-lending-sav)
- [JavaScript/Python examples](https://github.com/RippleDevRel/xrpl-js-python-simple-scripts)

Use the documentation that matches the actual network amendments and SDK, not just a similarly named tutorial. The official DevEx hook must be installed individually by each teammate with their own consent; this repository excludes personal capture identities and invitation credentials.
