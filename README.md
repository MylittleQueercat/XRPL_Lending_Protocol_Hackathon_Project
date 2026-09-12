# Raise — liquidity for XRPL vault shares

[Open the demo](https://raise.vgtray.fr) · [Team board](https://github.com/users/MylittleQueercat/projects/1) · [Product concept](docs/PROJECT_CONCEPT.md) · [Deployment](docs/DEPLOYMENT.md)

Raise is a secondary marketplace for existing XRPL vault shares. When outstanding loans leave a vault without enough cash for a withdrawal, an investor can offer shares to another investor at an agreed price. The buyer pays the seller; the underlying loans continue. An exit requires a willing buyer, and a discount does not guarantee profit.

**Track 1 · Loaded · network 4001 · faucet-funded test XRP.** XLS-65/XLS-66 provide the independently reproducible lending baseline. Batch (XLS-56) adds atomic XRP payment against vault-share delivery. Native vault shares alone are not the claimed Loaded extension.

## Current state

Updated September 12, 2026. This is a working hackathon application, with separate evidence for local E2E and hosted operation.

| Area | Implemented and verified |
|---|---|
| Lending | Open-ended vault, deposit, broker and cover, borrower-accepted loan, unavailable-withdrawal guardrail, repayment and redemption. |
| Marketplace | Shared fixed-price, full-lot offers; separate buyer/seller signatures; atomic settlement and exact transaction reconciliation. |
| Interface | Position, market, sell, offer detail, purchase and operator screens; Apple/system typography, light/dark themes and reduced-motion support. |
| Persistence | One Next.js Node server with SQLite; offers, reservations and submission state survive restarts. |
| Verification | 281 root + 119 web tests; type checks, production build and CI passed. Recorded real API/ledger and two-browser E2E journeys include buyer redemption. |
| Hosting | Running on Sunny through Dokploy, persistent volume, Cloudflare and HTTPS. See the dated [deployment checks and remaining acceptance work](docs/DEPLOYMENT.md#verification-record--12-september-2026). |

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

Create a funded test wallet from **Connect wallet**. Use two independent browser sessions for seller and buyer. Test seeds stay in their own browser session; the marketplace receives public data and signatures. The operator LoanSet form still uses a clearly labelled local borrower test-seed co-signing mode. See [wallet boundaries](docs/WALLET.md).

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

Standalone reproduction projects under `scripts/` retain the SDK versions that produced their historical evidence, including 5.2.0. They are separate from the beta.1 application. Network state and explorer history may change or reset after a recorded run.

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
- Slides, demo rehearsal and final submission/team sign-off remain #27–28. Deployment acceptance is tracked in #45. Current states live on the [board](https://github.com/users/MylittleQueercat/projects/1).

## Documentation map

| Need | Guide |
|---|---|
| Understand the product and buyer incentive | [Project concept](docs/PROJECT_CONCEPT.md), [accepted scope](docs/PRODUCT_SCOPE.md) |
| Run seller/buyer and recover pending operations | [Integration](docs/INTEGRATION.md), [web application](web/README.md) |
| Understand signing, pricing and execution | [Wallet](docs/WALLET.md), [read model](docs/READ_MODEL.md), [offers](docs/OFFERS.md), [settlement](docs/SETTLEMENT.md) |
| Deploy, back up, restore or roll back | [Sunny / Dokploy](docs/DEPLOYMENT.md) |
| Inspect standalone historical proofs | [Vault](docs/VAULT_BASELINE.md), [broker](docs/BROKER_BASELINE.md), [transfer](docs/SHARE_TRANSFER.md), [sale](docs/SALE.md) |
| Evaluate possible extensions | [Discovery](docs/DISCOVERY.md), [partial fills](docs/PARTIAL_FILLS.md), [embed](docs/EMBED.md) |
| Coordinate work | [Roadmap](docs/ROADMAP.md), [contribution guide](CONTRIBUTING.md) |
| Review developer feedback | [Manual report](DEVEX_FEEDBACK.md), [findings pool](devfeedback/README.md), [individual capture process](docs/DEVEX.md) |

## Official references

[Event instructions](https://app.notion.com/p/adam-hn/XRPL-Lending-Protocol-Hackathon-5cc7508f4cdc83a7991e01f90528e490) · [XLS-65](https://github.com/XRPLF/XRPL-Standards/tree/master/XLS-0065-single-asset-vault) · [XLS-66](https://github.com/XRPLF/XRPL-Standards/tree/master/XLS-0066-lending-protocol) · [Batch](https://xrpl.org/docs/references/protocol/transactions/types/batch) · [V1.1 accounting reference](https://opensource.ripple.com/docs/lending-protocol-v1-1)

Use the specification matching the actual network amendments. The project documents its Track 1 + Loaded interpretation; it does not claim private mentor approval. Each teammate configures DevEx capture independently with consent. The hook supplements the manual report and its presence in one checkout proves nothing about another teammate's setup.
