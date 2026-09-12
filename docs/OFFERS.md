# Offer model and lifecycle

The offer service stores advertisements for existing XRP vault shares on network **4001**. It does not own those shares, reserve ledger balances, sign transactions or submit a sale. The market and sell screens are integrated with this service through the shared HTTP coordinator; browser listings are no longer localStorage-only advertisements.

## Local commands

Use Node 24 and `npm ci`. The default database is `.local/offers.sqlite`, already ignored by Git. Every command accepts `--db PATH` to select another local database. Database files must remain outside source control.

Create an input file containing the offer terms. `sharesRaw` is an integer quantity of MPT units; `priceDrops` is the **total** asking payment in XRP drops, not a per-share price. Set `expiresAt` to a future UTC timestamp, including milliseconds and `Z`.

```json
{
  "networkId": 4001,
  "vaultId": "84953AA75CEBE50930F987E969D7918308B7C1471253DB0BD5E55CF3334C66DF",
  "shareMptId": "000000016D8E5748CD5FA882BDFF41D6619F430CF479D096",
  "seller": "rHmFRk6rLPAbWzDXaH1nUvxbhHgQiMxXag",
  "sharesRaw": "1000000",
  "priceAsset": { "currency": "XRP" },
  "priceDrops": "950000",
  "expiresAt": "REPLACE_WITH_A_FUTURE_UTC_TIMESTAMP"
}
```

The identifiers above are public demo objects, not accounts controlled by the person running the command. They may disappear after a network reset. Using an address in this local tool asserts an actor identity; it does **not** authenticate ownership of a wallet.

```sh
npm run offers -- create --input offer.json
npm run offers -- show --id OFFER_ID
npm run offers -- publish --id OFFER_ID --seller SELLER_ADDRESS
npm run offers -- list
npm run offers -- cancel --id OFFER_ID --seller SELLER_ADDRESS
```

`list` returns open, unexpired advertisements. Creating, publishing and cancelling only change the local database. In particular, publishing does not claim that the seller has been checked on the ledger. The shared HTTP API now authenticates wallet control using a short-lived, one-use signed challenge and derives the actor from that proof before calling these methods. These local CLI actor arguments remain an operator-only interface, never an HTTP authentication mechanism.

The standalone CLI can prepare an offer without executing a sale:

```sh
npm run offers -- prepare --id OFFER_ID --buyer BUYER_ADDRESS
```

This command reads a fresh validated position with `LedgerReader`, verifies the network, vault, share issuance, seller and sufficient raw share balance, then records one settlement attempt. It performs no financial transaction. The resulting `settling` state prevents another local acceptance of this same offer. It does not reserve shares on the ledger or across other offers by the seller. A current share balance is only a preflight check; the actual signed ledger execution still determines success.

## States

| State | Meaning |
|---|---|
| `draft` | Validated terms stored locally; not discoverable. |
| `open` | Published advertisement, subject to expiry and a fresh ownership check before execution preparation. |
| `cancelled` | Locally withdrawn by its seller; not discoverable or available for new preparation. |
| `expired` | The offer's acceptance deadline has passed before settlement preparation. |
| `settling` | One attempt has been recorded; execution or reconciliation must resolve it. |
| `settled` | A trusted settlement verifier has confirmed the attempt and both transfer legs. |

Expiry is refreshed on service reads and transitions. Cancellation or expiry does not revoke an already signed ledger transaction. Once an attempt is `settling`, uncertainty and elapsed time must not reopen it or authorize a duplicate submission. The service does not provide a manual `settled=true` CLI command.

## Persistence and integration boundary

The standalone CLI defaults to `.local/offers.sqlite` at the repository root.
The Next.js marketplace defaults to `web/.local/market.sqlite` when started from
`web/`; `RAISE_MARKET_DB_PATH` overrides that path. These are different stores.
CLI demo advertisements do not automatically appear in the web market. Use the
web API and wallet-signed actions for the shared marketplace, and avoid pointing
operator CLI experiments at a deployed database.

The web database holds offers, one-use challenges and settlement attempts in one
persistent SQLite file. The container uses `/data/market.sqlite` on a named
volume; see [DEPLOYMENT.md](DEPLOYMENT.md) for configuration and backup/restore.
Keep this file and its WAL state out of source control and build contexts.

SQLite stores exact monetary quantities as strings. Each offer has a revision. Conditional updates reject stale writes, including cancellation or another acceptance while a network read is pending. Separate processes using the same file share these checks. No database lock is held while awaiting the network.

The store uses Node's built-in `node:sqlite` module, so no SQLite npm dependency is required. The recorded Node 24.11.1 runs emitted an experimental-feature warning for this API. This embedded database is a local or single-host deployment choice; separate database copies do not share offers or coordinate acceptance. Use shared durable service storage before deploying multiple independent hosts.

The completion verifier is a trusted in-process integration adapter, not input from a buyer or an unauthenticated endpoint. It must verify actual validated ledger evidence for the recorded attempt, including the correct buyer, seller, share issuance, share quantity and XRP payment. An outer Batch `tesSUCCESS` alone is insufficient. The shared marketplace installs `XrplMarketGateway` as this verifier. It matches the exact outer and two inner transaction hashes, validated ledger, parent Batch relationship and delivered amounts. The standalone CLI intentionally has no completion override. See [integration details](INTEGRATION.md).

## Verification

Behavior tests exercise input validation, persistence across reopen, expiry, seller checks, concurrent state changes, fresh ownership checks and settlement evidence requirements. The CLI test launches separate processes against a temporary SQLite file, checks discovery and cancels the advertisement. It makes no network requests and submits no transactions.

[Live preflight evidence](../evidence/offer-preflight.json) records the complete local CLI journey on 2026-09-12. The oversized offer was rejected, cancellation survived a process restart, and the valid offer prepared once against validated ledger **67742**. A second preparation was rejected and the offer remained `settling`, with no claim of payment or share delivery.

## Shared API and two-party settlement

`GET /api/market` returns public offers and attempts. `POST /api/market/challenge` accepts an account and exact action; `POST /api/market` accepts only the resulting challenge ID, public key and signature. Challenges bind domain, origin, network, account, nonce, expiry and action; a nonce is consumed once. The actor must control an enabled master key on the fresh network-4001 ledger. Regular-key and account-multisign authentication are outside this version.

The coordinator in `src/market-service.ts` adds immutable prepared Batch terms, buyer authorization, seller outer signing, durable single broadcast and exact-hash reconciliation on top of the offer service. `awaiting-buyer → awaiting-seller → submitting/pending → settled` is an attempt lifecycle; it does not add a shortcut back to an open offer. Database revision checks serialize racing actors and survive server restarts.

Same-origin checks and a 48 KiB request limit apply before processing. Public snapshots omit signed blobs, private wallet data and challenge contents. Prepared Batch terms are included only while buyer or seller signatures are awaited; the complete submitted Batch is then omitted and recovery uses its hash. Transactions/signatures already published to XRPL are public. Failed, expired signed or unresolved attempts remain locked for operator investigation; this version does not offer an automatic retry or cancellation of a signed authorization.
