# Raise — web application

The marketplace interface for Raise, on the XRPL Lending Protocol Hackathon Track 1 network. Raise has its own visual identity: cream surfaces, sage accents, forest-green text, an original geometric mark, and an editorial serif paired with a clean sans-serif. Built with Next.js and Tailwind.

## Run

```sh
cd web
npm ci
npm run dev        # http://localhost:3000
npm run check      # typecheck (after next typegen) and unit tests
npm run build
```

No environment variables, no server, no database. The app talks to the ledger over WebSocket from the browser.

## Network

Fixed to the Track 1 hackathon devnet — network ID **4001**, `wss://lending-hackathon.dev.ripplex.io:51233`. The header shows the connected network and validated ledger at all times. Every signature is refused unless the node reports network 4001 at the moment of signing. The app never substitutes another ledger.

## Wallet

A **local development wallet**: the seed lives in `sessionStorage` only, signing happens in the browser with `xrpl.js`, disconnecting wipes the key. You can create a faucet-funded wallet in one click or import a test seed.

This is the frontend of the wallet boundary decided at the repo root in [`docs/WALLET.md`](../docs/WALLET.md) (`src/wallet.ts`). Why not a browser extension: the flows this product depends on — a `LoanSet` with a borrower counter-signature, and a `tfAllOrNothing` `Batch` where the buyer signs an inner leg — are not supported by Xaman, Crossmark or GemWallet, and none of them speaks to network 4001. See [`devfeedback/findings/008`](../devfeedback/findings/008-no-wallet-can-cosign-batch-or-loanset.md). The signing path is verified with a real validated transaction in [`evidence/web-wallet-signing.json`](../evidence/web-wallet-signing.json); reproduce with `npm run verify:wallet`.

For the two-party transactions, demo screens ask for the counterparty's **test seed** in a clearly labelled field, used once in the browser and never stored. That is a demonstration device, not a product design.

## Screens

| Route | Ticket | What it does |
|---|---|---|
| `/position` | #19 | Your vault shares, accounting value against available liquidity, deposit and withdraw. When the vault cannot fund a withdrawal, the rejection is explained and routes you to sell. |
| `/market`, `/market/[id]` | #20 | Open offers with unit price and discount against accounting value; offer detail with the vault's live state and the seller's live share balance. |
| `/sell` | #21 | Create, review and cancel offers on your position. |
| `/buy/[offerId]` | #22 | Purchase confirmation, atomic settlement, and post-trade ownership verified from the validated ledger. |
| `/operator` | #23 | Vault, broker, cover and two-party loan origination; borrower repayment. |

## What the screens refuse to do

- **Trust a submission result.** Balances, share supply, vault liquidity and loan state are re-read from the validated ledger after every transaction. On this protocol an outer `tesSUCCESS` on a `Batch` can sit over inner legs that never executed; the buy screen declares a sale only when both legs demonstrably moved.
- **Confuse a discount with yield.** Price against accounting value is shown as a discount or premium and named as such.
- **Pretend interest was earned at origination.** The network runs V1.1 cash-basis accounting: accounting value contains realised interest only.
- **Hide the limits of the offer model.** Offers are browser records for now — the client seam for the offer service in [`docs/OFFERS.md`](../docs/OFFERS.md) (#16), same lifecycle, field mapping documented in `src/lib/offers.ts`. Expiry and cancellation are enforced by Raise, ownership is verified on the ledger at settlement. Share valuation follows the exact integer rule in [`docs/READ_MODEL.md`](../docs/READ_MODEL.md) (#11).

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
