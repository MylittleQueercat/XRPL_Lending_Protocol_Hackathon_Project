# Raise — liquidity for XRPL vault shares

[Open the demo](https://raise.vgtray.fr) · [Team board](https://github.com/users/MylittleQueercat/projects/1) · [Product concept](docs/PROJECT_CONCEPT.md) · [Deployment](docs/DEPLOYMENT.md) · [Demo & pitch](docs/DEMO.md) · [Submission audit](docs/SUBMISSION.md)

Raise is a secondary marketplace for existing XRPL vault shares. When outstanding loans leave a vault without enough cash for a withdrawal, an investor can offer shares to another investor at an agreed price. The buyer pays the seller; the underlying loans continue. An exit requires a willing buyer, and a discount does not guarantee profit.

**Track 1 · Loaded · network 4001 · faucet-funded test XRP.** XLS-65/XLS-66 provide the independently reproducible lending baseline. Batch (XLS-56) adds atomic XRP payment against vault-share delivery. Native vault shares alone are not the claimed Loaded extension.

## Current state

Updated September 13, 2026. The current interface includes the new branding, wallet onboarding and Portfolio. This is a working hackathon application, with dated evidence kept separate for local E2E and hosted operation. The [submission audit](docs/SUBMISSION.md) maps the event requirements to proof and outstanding team confirmations.

| Area | Implementation / evidence |
|---|---|
| Lending | Open-ended vault, deposit, broker and cover, borrower-accepted loan, unavailable-withdrawal guardrail, repayment and redemption. |
| Marketplace | Shared fixed-price, full-lot offers; separate buyer/seller signatures; atomic settlement and exact transaction reconciliation. |
| Interface | Portfolio, market, sell, integrated offer/purchase and operator screens; new Raise branding, wallet onboarding, ledger-history charts, Apple/system typography, light/dark themes and reduced-motion support. |
| Persistence | One Next.js Node server with SQLite; offers, reservations and submission state survive restarts. |
| Verification | September 13: 281 root + 119 web tests and type checks pass. The [new two-browser journey](evidence/browser-market-e2e-2026-09-13.json) proves deposit, rejected withdrawal, sale, repayment and full buyer redemption on the updated UI. The production build passes. Hosted deployment results are recorded separately. |
| Hosting | September 13 application release `b17c06a` runs on Sunny through Dokploy, persistent volume, Cloudflare and HTTPS. Eight public routes and 18 JS/CSS assets pass; see the [deployment evidence](evidence/deployment-smoke-2026-09-13.json). |

The local E2E evidence is not a claim that the entire trade has been repeated on the public domain. Public deployment checks and their limits are recorded separately.

## Run locally

Use **Node 24, at least 24.11.1 and below 25**, and Git. `.nvmrc` selects Node 24. The deployed image uses Node 24.21.0. Install both committed lockfiles:

```sh
git clone https://github.com/MylittleQueercat/XRPL_Lending_Protocol_Hackathon_Project.git
cd XRPL_Lending_Protocol_Hackathon_Project
npm ci
npm ci --prefix web
npm run check
npm --prefix web run check
npm --prefix web run dev
```

Open **http://localhost:3000**. No API key or environment file is needed for that exact local origin. The server creates `web/.local/market.sqlite`. For another origin, set it explicitly; do not mix `localhost` and `127.0.0.1`:

```sh
RAISE_MARKET_ORIGIN=http://127.0.0.1:3100 npm --prefix web run dev -- --hostname 127.0.0.1 --port 3100
```

`RAISE_MARKET_DB_PATH` optionally selects an absolute database path. Production uses the required Compose variables in [.env.example](.env.example); follow [DEPLOYMENT.md](docs/DEPLOYMENT.md), not the local development command.

Create a funded test wallet from **Connect wallet**, or **Create a test wallet** in Portfolio onboarding. Use two independent browser sessions for seller and buyer. Test seeds stay in their own browser session; the marketplace receives public data and signatures. The operator LoanSet form still uses a clearly labelled local borrower test-seed co-signing mode. See [wallet boundaries](docs/WALLET.md).

A **Vault ID** is the full 64-character hexadecimal identifier of a vault, not your wallet address. The operator provides it; Portfolio can also discover vaults already known to the shared market. Use **Add vault** in Portfolio to watch a specific pool. `/position` redirects to `/portfolio`; old `/buy/<offerId>` links redirect to the offer page.

## The complete journey

1. The operator creates a transferable XRP vault and loan broker, with sufficient cover.
2. The investor deposits XRP into the vault and receives shares.
3. A borrower-accepted loan uses part of the vault's cash. A withdrawal beyond the remaining cash is rejected even when the investor owns enough shares.
4. The investor publishes an offer with a share quantity, total XRP price and expiry.
5. A buyer authorizes receipt when required and signs the prepared exchange. The seller approves the same exchange from their own session.
6. The server records the signed transaction before broadcasting. It confirms both inner payment legs against their exact hashes and validated metadata.
7. After repayment replenishes vault liquidity, the buyer can redeem shares. Buying and redeeming are separate operations.

The two trading accounts are additional to the operator/borrower roles needed for the lending fixture. The [integration guide](docs/INTEGRATION.md) explains setup, recovery and the controlled browser fixture.

## Network and stack

| Setting | Value |
|---|---|
| Application SDK | `xrpl@5.2.0-beta.1` in root and web packages |
| UI | Next.js 16.3.5, React 19.2.8, Tailwind CSS 4 |
| Server/storage | Node 24, Next route handlers, built-in `node:sqlite`, one host |
| Track / asset | Track 1 open-ended vault / test XRP |
| Network ID | **4001**, dedicated hackathon network |
| RPC | `https://lending-hackathon.dev.ripplex.io:51234` |
| WSS | `wss://lending-hackathon.dev.ripplex.io:51233` |
| Faucet | `https://lending-hackathon-faucet.dev.ripplex.io/accounts` |

The recorded ledger enables **LendingProtocolV1_1** and **BatchV1_1**. Open-ended origination succeeds there; realized interest is credited on payment, so the original V1 accounting assumption is not used. Run `npm run doctor` to verify current network readiness. The endpoints are fixed in `src/core.ts`; conflicting network overrides are rejected. Do not substitute public Testnet, public Devnet or mainnet.

The reviewed event page still contains its older stable/beta.0 SDK table; the beta.1 pin follows the explicit SDK update supplied to the team. This version/network discrepancy is disclosed in [SUBMISSION.md](docs/SUBMISSION.md), rather than silently switching the tested environment.

Standalone reproduction projects under `scripts/` retain the SDK versions that produced their historical evidence, including 5.2.0. They are separate from the beta.1 application. Network state and explorer history may change or reset after a recorded run.

## Transactions used

These are actual transaction types used by the application and recorded on network 4001. Links below refer to the dated September 12 API/ledger E2E; see its [full proof](evidence/market-e2e.json) for both inner Payment hashes and state deltas.

| Primitive | Transaction | Purpose / validated example |
|---|---|---|
| XLS-65 | `VaultCreate` | Create the open-ended XRP vault. [Ledger 71760](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/A3E9C40CDF880DF839D78E07655E7D8D35B48DF34524162938F371498B2F8BCA). |
| XLS-65 | `VaultDeposit` | Exchange deposited XRP for vault shares. [Ledger 71762](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/F4BE5D7188908E93C1CA2F35240A0E63F32483D134B4B58A2B3AC0219642E699). |
| XLS-65 | `VaultWithdraw` | Redeem shares; the same type demonstrates the unavailable-cash guardrail. [Ledger 71777](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/9B061C5065ED93F760D682CC5E34FE2510A0BAB870DF85401C3B3C56A1F75085). |
| XLS-66 | `LoanBrokerSet` | Configure the broker and cover parameters. [Ledger 71764](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/8E5B52AE8862FA766109F016E507F375BAAD9E158D7B787F0069B65883CAF824). |
| XLS-66 | `LoanBrokerCoverDeposit` | Fund first-loss cover. [Ledger 71765](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/F641D852A1F665B935C3EAC6B073858714677E6027C000C7511D8DB42AF92BBD). |
| XLS-66 | `LoanSet` | Originate with borrower acceptance and disburse principal. [Ledger 71767](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/CB305FB6B4BDC859EB9C7278C9739DA8A6C998111F55BC92FB6CC4650A3A4A86). |
| XLS-66 | `LoanPay` | Repay the loan and recognize paid interest. [Ledger 71776](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/D5E49235BC2017D36352572A0AA1F030218FCC3A0232A92AF340A2A9F6341EF0). |
| MPT | `MPTokenAuthorize` | Prepare the buyer to receive the share issuance. [Ledger 71771](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/C83A84814CB4838BD11D8551EAD33A914D6E5F6A7844AB17DC5061BD5A74FB68). |
| XLS-56 | `Batch` | Atomically exchange XRP and vault-share MPTs using two inner Payment transactions. [Ledger 71774](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/A651D9CF466D4275E6985603D6DA3B127444AB9C1B44EBAC3C8BE785EB692016). |

The separate [Vanilla baseline](evidence/vanilla-flow.json) records **100 XRP deposited → 100.000188 XRP gross redemption**, including 188 drops of realized yield and zero final shares. It satisfies capital-plus-yield with the measured amount; the figure is not an illustrative return.

## Commands and evidence

| Command | Scope |
|---|---|
| `npm run check` | Root type checks and offline tests. |
| `npm --prefix web run check` | Web type checks and offline tests. |
| `npm --prefix web run build` | Production UI/server build. |
| `npm run doctor` | Read-only RPC/WSS network, amendment and freshness checks. |
| `npm run vanilla` | Fresh test actors and full lending baseline, including repayment and redemption. Sends ledger transactions. |
| `npm run market:e2e` | Complete real HTTP/SQLite/ledger journey against a running **localhost** server. Sends test-network transactions; see the integration guide. |
| `npm run settlement` | Fresh test actors; successful sale, failed-delivery scenarios and identical-transaction replay. |
| `npm run vault:smoke` | Fresh wallets, vault creation, 10 XRP deposit and withdrawal. |
| `npm run wallet:live-test` | Historical signing-boundary opt-in check on the event ledger. |
| `npm run position -- --vault ID --account ADDRESS` | Read a validated position. |
| `npm run transaction -- --hash HASH` | Read finality without resubmission. |
| `npm run offers -- list` | Local CLI offer store, separate from the shared web marketplace. |

Live scripts are explicit opt-ins, create ledger objects and consume test XRP fees. They do not resume an ambiguous payment automatically. Wallets and private run files remain in ignored `.local/` storage. Never commit them.

| Recorded proof | What it establishes |
|---|---|
| [API/ledger E2E](evidence/market-e2e.json) | Lending, shared offer, two-party atomic purchase, repayment and buyer redemption. |
| [Two-browser E2E](evidence/browser-market-e2e.json) | Actual seller/buyer screens and separate signing sessions; validated sale and buyer redemption. |
| [Browser recovery/UI](evidence/browser-ui-checks.json) | Pending-transaction recovery after server restart and UI checks. |
| [Vanilla lending](evidence/vanilla-flow.json) | XLS-65/66 baseline and liquidity guardrail. |
| [Settlement failures](evidence/settlement-failures.json) | Failed economic legs despite outer success, successful reference sale and replay rejection. |
| [Beta.1 vault smoke](evidence/vault-smoke-beta.1.json) | Vault creation, deposit and withdrawal using the active application SDK version. |
| [Deployment record](docs/DEPLOYMENT.md) | Image/source identity, runtime, TLS, persistence and hosted acceptance status. |

An outer Batch `tesSUCCESS` is insufficient evidence of an exchange. The integrated verifier requires the exact inner hashes, parent Batch ID, ledger and delivered amounts. Full hashes and ledger indexes remain in the linked reports; historical transaction results are not rewritten when documentation changes.

## Limits and remaining work

- Full-lot, seller-posted asks are the current trading flow. Partial fills are a tested domain/storage exploration, not a live partial-trading feature. Bids, RFQs and order-book matching are not implemented.
- The embed route is a launch/handoff prototype, not a production partner SDK. Customer and integrator validation remain open in #31–32.
- Demo master-key wallets only; no verified external connector for the complete custom-network signing flow. No account multisigning or independent server replicas.
- Signed failures remain locked for investigation. Offer cancellation/expiry cannot revoke a previously signed Batch. There is no general recovery administration console.
- The [English pitch and demo plan](docs/DEMO.md) and [submission audit](docs/SUBMISSION.md) are prepared. The team reports its existing slides ready; their format/slide count and the requested final video remain separate checks. Form delivery, final team approval and rehearsal require their own confirmations (#27–28). Hosted acceptance is dated separately in #45 and the deployment record.

## Documentation map

| Need | Guide |
|---|---|
| Understand the product and buyer incentive | [Project concept](docs/PROJECT_CONCEPT.md), [accepted scope](docs/PRODUCT_SCOPE.md) |
| Run seller/buyer and recover pending operations | [Integration](docs/INTEGRATION.md), [web application](web/README.md) |
| Understand signing, pricing and execution | [Wallet](docs/WALLET.md), [read model](docs/READ_MODEL.md), [offers](docs/OFFERS.md), [settlement](docs/SETTLEMENT.md) |
| Deploy, back up, restore or roll back | [Sunny / Dokploy](docs/DEPLOYMENT.md) |
| Inspect standalone historical proofs | [Vault](docs/VAULT_BASELINE.md), [broker](docs/BROKER_BASELINE.md), [transfer](docs/SHARE_TRANSFER.md), [sale](docs/SALE.md) |
| Evaluate possible extensions | [Discovery](docs/DISCOVERY.md), [partial fills](docs/PARTIAL_FILLS.md), [embed](docs/EMBED.md) |
| Present and submit | [English pitch / video plan](docs/DEMO.md), [requirement matrix](docs/SUBMISSION.md) |
| Coordinate work | [Roadmap](docs/ROADMAP.md), [contribution guide](CONTRIBUTING.md) |
| Review developer feedback | [Existing report](DEVEX_FEEDBACK.md), [findings pool](devfeedback/README.md), [individual capture process](docs/DEVEX.md). The team prepares and approves the final manual report without AI. |

## Official references

[Event instructions](https://app.notion.com/p/adam-hn/XRPL-Lending-Protocol-Hackathon-5cc7508f4cdc83a7991e01f90528e490) · [XLS-65](https://github.com/XRPLF/XRPL-Standards/tree/master/XLS-0065-single-asset-vault) · [XLS-66](https://github.com/XRPLF/XRPL-Standards/tree/master/XLS-0066-lending-protocol) · [Batch](https://xrpl.org/docs/references/protocol/transactions/types/batch) · [V1.1 accounting reference](https://opensource.ripple.com/docs/lending-protocol-v1-1)

Use the specification matching the actual network amendments. The project documents its Track 1 + Loaded interpretation; it does not claim private mentor approval. Adam confirms the teammates have installed DevEx capture. Each installation remains individual and consent-based; current capture and remote delivery require per-developer evidence. The hook supplements the manual report.
