# Raise — web application

The marketplace interface for Raise, on the XRPL Lending Protocol Hackathon Track 1 network. Raise has its own visual identity: cream surfaces, sage accents, forest-green text, an original geometric mark, and Apple/system typography (`-apple-system`, `BlinkMacSystemFont`, system fallbacks), light/dark themes, CSS motion and reduced-motion support. Built with Next.js 16.3.5, React 19.2.8 and Tailwind CSS 4.

The public demo is [raise.vgtray.fr](https://raise.vgtray.fr). See the [deployment record](../docs/DEPLOYMENT.md) for its exact release and acceptance checks; local E2E evidence has a separate scope.

## Run

```sh
npm ci            # repository root dependencies are also required
cd web
npm ci
npm run dev        # http://localhost:3000
npm run check      # typecheck (after next typegen) and unit tests
npm run build
```

The Next.js Node server serves the shared marketplace API and persists offers, one-use signing challenges and settlement attempts in SQLite. The default origin is `http://localhost:3000`, and the default database is `web/.local/market.sqlite`. Browser ledger reads and local signing still use WebSocket.

For another port or hostname, set the exact `RAISE_MARKET_ORIGIN` (for example `http://127.0.0.1:3100`) when starting Next. `RAISE_MARKET_DB_PATH` optionally selects an absolute database path. Both actors must use the same origin and server. Run one Node instance with persistent disk; independent database copies, ephemeral serverless instances and multiple hosts are unsupported.

Development and builds use Webpack with Node externals for xrpl.js and ripple-keypairs. Restart Next after changing server/core modules: the development runtime singleton intentionally preserves database connections across hot reloads. Do not run `build` and `dev` concurrently against the same `.next` directory.

## Network

Fixed to the Track 1 hackathon devnet — network ID **4001**, `wss://lending-hackathon.dev.ripplex.io:51233`. The header shows the connected network and validated ledger at all times. Every signature is refused unless the node reports network 4001 at the moment of signing. The app never substitutes another ledger.

## Wallet

A **local development wallet**: the seed lives in `sessionStorage` only, signing happens in the browser with `xrpl.js`, disconnecting wipes the key. You can create a faucet-funded wallet in one click or import a test seed.

The browser provider is `src/lib/wallet.tsx`; its signing helpers and shared-market intent signing are separate from the historical root `src/wallet.ts` contract. See [WALLET.md](../docs/WALLET.md). No external connector has been verified in this project for the complete custom-network LoanSet/Batch signing surface. This is a project validation boundary, not a universal claim that named wallet products cannot support it.

The actual browser journey is recorded in [browser-market-e2e.json](../evidence/browser-market-e2e.json). [web-wallet-signing.json](../evidence/web-wallet-signing.json) is a narrower signing check; `npm run verify:wallet` submits a real event-network transaction with explicit storage/Web Lock stand-ins.

For marketplace purchases, the buyer and seller connect their own test wallets in separate browser sessions. The buyer signs the prepared Batch authorization, then the seller reviews and signs the exact outer transaction. Neither party provides a counterparty seed. The operator-only `LoanSet` screen still uses an explicitly labelled borrower test-seed co-signing device; this is a separate development limitation.

Single-account transactions persist public recovery hashes before broadcasting. A timeout blocks new submissions from that account until the exact transaction is reconciled. Web Locks and session/local storage are required; signing fails closed if safe recovery storage is unavailable. Faucet identities are saved before funding checks so a dropped RPC connection does not lose the generated account.

## Screens

The interface is a trading terminal, in the MetaTrader convention: dense panels, tabular numbers, **blue = up / long / profit / discount, red = down / loss / premium**, values that flash when the ledger moves them. Charts are real: the Track 1 node keeps full history, so a vault's past state is read with `ledger_entry` at earlier ledgers (`src/lib/history.ts`), plus one exact sample at every deposit, withdrawal, disbursement and repayment of the vault.

| Route | Ticket | What it does |
|---|---|---|
| `/` | — | Landing page and navigation. |
| `/portfolio` | #19, #21 | The portfolio terminal: account strip (balance, positions, equity, withdrawable today, open offers, ledger), market watch of your vaults with NAV sparklines, the NAV / assets / utilisation chart with activity markers, the deposit and withdraw ticket with the ledger's verdict and the "sell instead" route, and the toolbox (positions, orders, history from `account_tx`). `/position` redirects here. |
| `/market` | #20 | Market watch: open, settled and all offers quoted against live NAV per share, with discount or premium coloured blue or red, sparklines, utilisation and expiry. |
| `/market/[id]` | #20, #22 | One page per offer: figures strip, NAV chart with the asked unit price as a reference, vault panel, and the sale ticket (buyer authorisation, purchase request, buyer signature, seller approval, reconciliation). `/buy/[offerId]` redirects here. |
| `/sell` | #21 | Sell ticket: position summary and NAV chart on the left, the order ticket on the right (quantity, price with at-NAV and discount quick fills, expiry, live unit price and discount preview, review, publish), your offers below. |
| `/operator` | #23 | The lending desk: KPI strip, navigator (vaults, brokers, loans), asset and cash chart with activity markers, cash-versus-deployed donut, activity feed, broker cover-versus-debt, loan payment schedule (projection, labelled as such), the action tickets (seed liquidity, broker, originate, cover), the loan blotter, and the borrower tab with repayment tickets. |
| `/embed` | #32 | Validated launch/handoff prototype, not a complete partner SDK. |

## What the screens refuse to do

- **Trust a submission result.** Balances, share supply, vault liquidity and loan state are re-read from the validated ledger after every transaction. On this protocol an outer `tesSUCCESS` on a `Batch` can sit over inner legs that never executed; the buy screen declares a sale only after the server verifies the exact outer hash, both inner transaction hashes, their parent Batch ID, ledger and delivered amounts. API v2 `DeliverMax` is normalized before canonical transaction hashing.
- **Confuse a discount with yield.** Price against accounting value is shown as a discount or premium and named as such.
- **Pretend interest was earned at origination.** The network runs V1.1 cash-basis accounting: accounting value contains realised interest only.
- **Hide the limits of the offer model.** Offers are shared durable server records, accessed through authenticated one-use wallet-signed intents. Both accounts see the same offers and attempts. Expiry and cancellation stop new preparations; they do not revoke an already signed Batch. Pending or failed attempts remain locked until their exact outcome is resolved; the app never silently reopens them. Share valuation follows the exact integer rule in [`docs/READ_MODEL.md`](../docs/READ_MODEL.md) (#11).

## Structure

```
src/app/            routes (one folder per screen)
src/components/ui/  design system: button, card, badge, input, label, table, skeleton, separator, alert
src/components/terminal/  workstation primitives: panel, tabs, KPI strip, tick flash, signed deltas
src/components/charts/    recharts wrappers (time series, donut, bars, sparkline) and the vault-history hook
src/components/portfolio/ the portfolio terminal
src/components/operator/  the lending desk
src/components/market/, sell/, buy/  market watch, offer page, sale ticket, sell ticket
src/lib/history.ts  real vault history from ledger_entry at past ledgers, account_tx activity
src/components/     shell, network badge, wallet button, page header, stat, tx result
src/lib/network.ts  fixed Track 1 configuration and route contract
src/lib/ledger.ts   validated-ledger reads and signing helpers (single, LoanSet two-party, sale Batch)
src/lib/wallet.tsx  local development wallet provider
src/lib/offers.ts   offer display/view model; not authoritative persistence
src/lib/market-client.ts  same-origin marketplace HTTP client
src/lib/market-signing.ts  wallet action intents and two-party approvals
src/lib/submission-journal.ts  public transaction recovery journal
src/lib/server/market*.ts  SQLite runtime and HTTP origin/authentication boundary
src/app/api/market/  shared snapshot, actions and challenge endpoints
src/lib/format.ts   exact drop formatting, never rounding ledger values
tests/              unit tests (vitest)
verify/             live-network verification, run explicitly
```

## Integrated verification and two-account use

See [Integration and recovery](../docs/INTEGRATION.md) for the exact test boundaries and the local buyer/seller walkthrough. `npm run market:e2e` from the repository root creates fresh faucet actors and verifies the real HTTP API, production signing helpers, ledger sale, repayment and buyer redemption. It requires a running local server and sends event-network transactions; ordinary unit tests never do.

The `/embed?network=4001` launch boundary and notification envelope are an [exploration prototype](../docs/EMBED.md). Partial fills are an independently tested [domain/store prototype](../docs/PARTIAL_FILLS.md), not an exposed trading mode.
