# Raise — XRPL vault-share liquidity

Raise proposes a secondary market where an investor can sell existing vault shares to another investor when the vault has insufficient cash for a withdrawal. The buyer pays the seller and takes over the share exposure; the underlying loans continue. A buyer and an agreed price are required: liquidity and returns are not guaranteed.

**The Track 1 Vanilla baseline is complete and verified on the event ledger.** This repository contains a reproducible TypeScript environment, network checks, the full XLS-65 + XLS-66 lending flow, automated tests, the manual DevEx report and the team roadmap. The secondary marketplace is a subsequent milestone, not an implemented feature.

- [Manual developer-feedback report](DEVEX_FEEDBACK.md)
- [Project concept — English team discussion document](docs/PROJECT_CONCEPT.md)
- [Shared team board](https://github.com/users/MylittleQueercat/projects/1)
- [Detailed roadmap](docs/ROADMAP.md)
- [32 unassigned project issues](https://github.com/MylittleQueercat/XRPL_Lending_Protocol_Hackathon_Project/issues?q=is%3Aissue+label%3Aroadmap)
- [Six milestones](https://github.com/MylittleQueercat/XRPL_Lending_Protocol_Hackathon_Project/milestones)
- [How teammates can contribute](CONTRIBUTING.md)

## Current network finding

On September 12, 2026, the event endpoint reported network **4001**, rippled **3.4.0-rc1**, and **SingleAssetVault, LendingProtocol and LendingProtocolV1_1 enabled**.

We initially read the [V1.1 documentation](https://opensource.ripple.com/docs/lending-protocol-v1-1) as restricting new loans to closed-ended vaults, and treated that as a blocker. **Measurement on the ledger shows it is not one.** Open-ended origination succeeds: see `LoanSet` [C2E78A88…](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/C2E78A8834AEE372C56580E4D4C521F43551D7F5599F6DE255209C6C7BC41469) and the complete run in [`evidence/vanilla-flow.json`](evidence/vanilla-flow.json).

What V1.1 does change is **accounting**. A 400 XRP loan carrying 244.19 XRP of scheduled interest left the vault's `AssetsTotal` at exactly 800.000000 XRP at origination, so interest is realised when a payment delivers it, not at origination as V1 would. `npm run doctor` therefore exits **0** and reports this in `notes` rather than `blockers`: it is a reporting caveat, documented in [`DEVEX_FEEDBACK.md`](DEVEX_FEEDBACK.md) §1, not a reason to refuse to run.

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

No API key or `.env` file is required. The SDK is pinned to **xrpl.js 5.2.0** with a committed lockfile. `npm run check` runs strict type checking and offline tests; it does not contact the network or create wallets. CI repeats these checks and dependency auditing.

| Target | Value |
|---|---|
| Track | 1: open-ended vault, Lending Protocol V1 target |
| Flavour | Vanilla foundation; no Loaded claim |
| Network ID | 4001, event network |
| JSON-RPC | `https://lending-hackathon.dev.ripplex.io:51234` |
| WebSocket | `wss://lending-hackathon.dev.ripplex.io:51233` |
| Faucet | `https://lending-hackathon-faucet.dev.ripplex.io/accounts` |
| Asset | Faucet-funded test XRP |

## Commands

| Command | Behavior |
|---|---|
| `npm run check` | Typecheck and offline tests. |
| `npm run doctor` | Read HTTP/WebSocket server information and amendments; check network, synchronization and ledger freshness. Exit 0 when compatible, 2 when reachable but incompatible, 1 on error. |
| `npm run vault:smoke` | Create two fresh faucet wallets, create a transferable XRP vault, deposit 10 XRP, withdraw 10 XRP, and verify validated results and balances. Sends test-network transactions. |
| `npm run vanilla` | Run the complete Track 1 Vanilla baseline end to end: vault, deposit, broker, cover, origination, guardrail, repayment and redemption. Creates three faucet wallets and sends test-network transactions. Holds the loan open for `RAISE_LOAN_HOLD_SECONDS` (default 120) so interest accrues measurably. |
| `npm audit` | Check installed dependencies for known advisories. |

Run the smoke explicitly when you want new test accounts and ledger objects:

```sh
npm run vault:smoke
```

Every invocation creates fresh test wallets. It leaves the empty vault and test accounts on the event ledger after verification. It does not remove objects or reclaim account reserves. The checked run charged 2 test XRP for `VaultCreate`, plus 12 drops each for deposit and withdrawal; current fees are autofilled from the network.

The event faucet returns its own `account.address` and `account.secret`; it does not honor a destination address as expected by the usual funding flow. The adapter verifies that the returned seed derives the returned address, saves the wallet locally, and checks the funded balance on the selected network. It never logs the faucet response or seeds.

Secrets and run details are stored under ignored `.local/` directories with directory mode `0700` and file mode `0600` on Unix. Keep these files local. For an ambiguous submission, inspect the saved transaction-intent hash and query its outcome before retrying; the CLI does not blindly resubmit signed transactions. A new smoke invocation creates a separate run rather than resuming the previous one.

## Verified ledger evidence

### Track 1 Vanilla baseline — complete

The [sanitized run report](evidence/vanilla-flow.json) records the full flow on network 4001. Every minimum-bar item is covered by a validated transaction.

| # | Minimum-bar item | Transaction | Result | Ledger |
|---|---|---|---|---:|
| 1 | Open-ended Single Asset Vault | [`VaultCreate` 3FCB90A6…](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/3FCB90A68AC51207654F18AE14DD258192136F8F3599EE54500F46AFAC85CAE5) | `tesSUCCESS` | 66255 |
| 2 | Lender deposits capital | [`VaultDeposit` 88DBE993…](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/88DBE993733DA97EFCC499121F877E948689DE997B07D85A56D27D65239B3C30) | `tesSUCCESS` | 66256 |
| 3 | Loan broker set up | [`LoanBrokerSet` 6CA76A06…](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/6CA76A0679F415BAC269ECB0BDF6B05403A997CAA83B3A067EE4AF2E501984AF) | `tesSUCCESS` | 66258 |
| 3–4 | Borrower-accepted origination and drawdown | [`LoanSet` C2E78A88…](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/C2E78A8834AEE372C56580E4D4C521F43551D7F5599F6DE255209C6C7BC41469) | `tesSUCCESS` | 66260 |
| 7 | Guardrail: withdrawal beyond available liquidity | [`VaultWithdraw` 87AA2965…](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/87AA2965B17E3CE1DED0659D30E24ED384826AF48EF8B44BCC278E638EEA346E) | **`tecINSUFFICIENT_FUNDS`** | 66261 |
| 5 | Repayment | [`LoanPay` 0F61D208…](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/0F61D208FEB12445CB73FF8A21E78CF6BD67BA67B00EBCDF1D23BE91B357A952) | `tesSUCCESS` | 66302 |
| 6 | Capital plus accrued yield redeemed | [`VaultWithdraw` F4C02E70…](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/F4C02E7083DC258B976FA1374E121833DAC398BAB79986BE47145A99A365F424) | `tesSUCCESS` | 66304 |

**The guardrail is the point, not an accident.** The lender held shares covering their whole position and still could not exit: 100 XRP requested against 50 XRP available once the loan was funded. That is precisely the problem Raise exists to solve.

**Yield is reported exactly, including its limits.** The lender deposited 100.000000 XRP and redeemed 100.000177 XRP. Those 177 drops are real accrued interest on a 50 XRP loan held open for 120 seconds; the contract's own formula predicts 190 drops, and the difference is ledger close timing. With `InterestRate` capped at 100 % annualised and no time acceleration on this network, a demo loan cannot yield more than dust — see [`DEVEX_FEEDBACK.md`](DEVEX_FEEDBACK.md) §4. We report the mechanism and reconcile it rather than presenting a simulated figure.

Interest is realised on payment, not at origination, because V1.1 is enabled. Item 8 of the minimum bar, the credible use case, is covered by [`docs/PROJECT_CONCEPT.md`](docs/PROJECT_CONCEPT.md).

### XLS-65 vault smoke — standalone

The [sanitized smoke report](evidence/vault-smoke.json) records three validated `tesSUCCESS` transactions and exact before/after values:

| Operation | Ledger | Transaction |
|---|---:|---|
| `VaultCreate` | 65163 | [70740BF4…](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/70740BF4500A9E37C5AFAAA0706FB74F2D5EE38787EC150404088E62A473BF56) |
| `VaultDeposit` | 65165 | [76F408DE…](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/76F408DE062E73ABD5738AB733F952599045694A7C720A13ADC5E476A7D2390B) |
| `VaultWithdraw` | 65167 | [DD1BCC04…](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/DD1BCC04E48B181A18DFC260F109076FCE77808DA27E97076001CA5D35746D63) |

The deposit created **10,000,000 raw share units** and 10 XRP of available vault assets. Withdrawal returned 10 XRP and left share supply and vault assets at zero. Share transferability was read from the actual issuance flags; a transfer to a buyer is still future work. The raw unit ratio in this empty-vault example is not a universal pricing rule.

This proves **XLS-65 only**. It does not prove a loan, the guardrail or a completed secondary sale. Event ledgers may reset; the checked reports retain hashes and ledger indexes even if an explorer later loses history.

## Next steps

1. Prove transfer of vault shares to a new holder and confirm the new holder can withdraw.
2. Select and prove a payment-for-shares settlement mechanism with atomicity guarantees.
3. Build the investor, market, seller, buyer and operator journeys on those proofs.
4. Verify the integrated flow and prepare the presentation and submission.
5. Consider Loaded and broader market features after the secondary sale works.

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
