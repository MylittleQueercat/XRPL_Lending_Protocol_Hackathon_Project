# Raise — web application

The marketplace interface for Raise, on the XRPL Lending Protocol Hackathon Track 1 network. Raise has its own visual identity: cream surfaces, sage accents, forest-green text, an original geometric mark, and an editorial serif paired with a clean sans-serif. Built with Next.js and Tailwind.

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

This is the frontend of the wallet boundary decided at the repo root in [`docs/WALLET.md`](../docs/WALLET.md) (`src/wallet.ts`). Why not a browser extension: the flows this product depends on — a `LoanSet` with a borrower counter-signature, and a `tfAllOrNothing` `Batch` where the buyer signs an inner leg — are not supported by Xaman, Crossmark or GemWallet, and none of them speaks to network 4001. See [`devfeedback/findings/008`](../devfeedback/findings/008-no-wallet-can-cosign-batch-or-loanset.md). The signing path is verified with a real validated transaction in [`evidence/web-wallet-signing.json`](../evidence/web-wallet-signing.json); reproduce with `npm run verify:wallet`.

For marketplace purchases, the buyer and seller connect their own test wallets in separate browser sessions. The buyer signs the prepared Batch authorization, then the seller reviews and signs the exact outer transaction. Neither party provides a counterparty seed. The operator-only `LoanSet` screen still uses an explicitly labelled borrower test-seed co-signing device; this is a separate development limitation.

Single-account transactions persist public recovery hashes before broadcasting. A timeout blocks new submissions from that account until the exact transaction is reconciled. Web Locks and session/local storage are required; signing fails closed if safe recovery storage is unavailable. Faucet identities are saved before funding checks so a dropped RPC connection does not lose the generated account.

## Screens

| Route | Ticket | What it does |
|---|---|---|
| `/position` | #19 | Your vault shares, accounting value against available liquidity, deposit and withdraw. When the vault cannot fund a withdrawal, the rejection is explained and routes you to sell. |
| `/market`, `/market/[id]` | #20 | Open offers with unit price and discount against accounting value; offer detail with the vault's live state and the seller's live share balance. |
| `/sell` | #21 | Create, review and cancel offers on your position. |
| `/buy/[offerId]` | #22 | Purchase confirmation, atomic settlement, and post-trade ownership verified from the validated ledger. |
| `/operator` | #23 | Vault, broker, cover and two-party loan origination; borrower repayment. |

## What the screens refuse to do

- **Trust a submission result.** Balances, share supply, vault liquidity and loan state are re-read from the validated ledger after every transaction. On this protocol an outer `tesSUCCESS` on a `Batch` can sit over inner legs that never executed; the buy screen declares a sale only after the server verifies the exact outer hash, both inner transaction hashes, their parent Batch ID, ledger and delivered amounts. API v2 `DeliverMax` is normalized before canonical transaction hashing.
- **Confuse a discount with yield.** Price against accounting value is shown as a discount or premium and named as such.
- **Pretend interest was earned at origination.** The network runs V1.1 cash-basis accounting: accounting value contains realised interest only.
- **Hide the limits of the offer model.** Offers are shared durable server records, accessed through authenticated one-use wallet-signed intents. Both accounts see the same offers and attempts. Expiry and cancellation stop new preparations; they do not revoke an already signed Batch. Pending or failed attempts remain locked until their exact outcome is resolved; the app never silently reopens them. Share valuation follows the exact integer rule in [`docs/READ_MODEL.md`](../docs/READ_MODEL.md) (#11).

## Structure

```
src/app/            routes (one folder per screen)
src/components/ui/  design system: button, card, badge, input, label, table, skeleton, separator, alert
src/components/     shell, network badge, wallet button, page header, stat, tx result
src/lib/network.ts  fixed Track 1 configuration and route contract
src/lib/ledger.ts   validated-ledger reads and signing helpers (single, LoanSet two-party, sale Batch)
src/lib/wallet.tsx  local development wallet provider
src/lib/offers.ts   offer model and lifecycle
src/lib/format.ts   exact drop formatting, never rounding ledger values
tests/              unit tests (vitest)
verify/             live-network verification, run explicitly
```

## Integrated verification and two-account use

See [Integration and recovery](../docs/INTEGRATION.md) for the exact test boundaries and the local buyer/seller walkthrough. `npm run market:e2e` from the repository root creates fresh faucet actors and verifies the real HTTP API, production signing helpers, ledger sale, repayment and buyer redemption. It requires a running local server and sends event-network transactions; ordinary unit tests never do.

The `/embed?network=4001` launch boundary and notification envelope are an [exploration prototype](../docs/EMBED.md). Partial fills are an independently tested [domain/store prototype](../docs/PARTIAL_FILLS.md), not an exposed trading mode.
