# Offer model and lifecycle

The offer service stores advertisements for existing XRP vault shares on network **4001**. It does not own those shares, reserve ledger balances, sign transactions or submit a sale. This is the backend foundation for the market and sell screens in tickets #20 and #21.

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

`list` returns open, unexpired advertisements. Creating, publishing and cancelling only change the local database. In particular, publishing does not claim that the seller has been checked on the ledger. A future HTTP API must authenticate wallet control and derive the actor from that session before calling these service methods.

Before handing an open offer to a future settlement executor:

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

SQLite stores exact monetary quantities as strings. Each offer has a revision. Conditional updates reject stale writes, including cancellation or another acceptance while a network read is pending. Separate processes using the same file share these checks. No database lock is held while awaiting the network.

The store uses Node's built-in [`node:sqlite` module](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html), so no new npm dependency is required. The supported Node 24.11.1 runtime emits an experimental-feature warning for this API. This embedded database is a local or single-host deployment choice; separate database copies do not share offers or coordinate acceptance. Use shared durable service storage before deploying multiple independent hosts.

The completion verifier is a trusted in-process integration adapter, not input from a buyer or an unauthenticated endpoint. It must verify actual validated ledger evidence for the recorded attempt, including the correct buyer, seller, share issuance, share quantity and XRP payment. An outer Batch `tesSUCCESS` alone is insufficient. No default verifier is installed: completion fails closed until the settlement implementation provides one. The independent settlement failure/reconciliation work belongs to #15.

## Verification

Behavior tests exercise input validation, persistence across reopen, expiry, seller checks, concurrent state changes, fresh ownership checks and settlement evidence requirements. The CLI test launches separate processes against a temporary SQLite file, checks discovery and cancels the advertisement. It makes no network requests and submits no transactions.

[Live preflight evidence](../evidence/offer-preflight.json) records the complete local CLI journey on 2026-09-12. The oversized offer was rejected, cancellation survived a process restart, and the valid offer prepared once against validated ledger **67742**. A second preparation was rejected and the offer remained `settling`, with no claim of payment or share delivery.
