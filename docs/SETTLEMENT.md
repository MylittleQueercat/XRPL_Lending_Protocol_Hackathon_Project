# Payment-for-shares settlement (Issue #13)

## Decision

Raise selects a multi-account `Batch` with `tfAllOrNothing` for the sale of XRP
against transferable XLS-65 vault-share MPT units. The payment and share
delivery are inner transactions in one atomic ledger operation. Two independent
`Payment` transactions are explicitly **not** an atomic sale: either leg can
land while the other fails or is never submitted.

This is a real product requirement (payment-versus-delivery), not feature
stuffing. The Track 1 custom Devnet has `BatchV1_1` enabled and recognizes
`Batch` (transaction type 71), alongside `Payment` (0). The original feasibility evidence below was
produced with xrpl.js `5.2.0` in `scripts/raise-feasibility`. The current root and
browser projects pin `5.2.0-beta.1`; the integrated API and browser runs use
that version. These are separate recorded runs, not a claim that the historical
script version was changed. `SingleAssetVault`, `LendingProtocol`,
`MPTokensV1`, and `LendingProtocolV1_1` were also enabled in the recorded live
`feature` response.

The native DEX/order route was not selected: the repository has no validated
Track 1 transaction proving an order can exchange this vault-share MPT against
XRP with the required seller/buyer authorization. It is therefore not treated
as a supported candidate merely because general MPT/DEX documentation exists.

## Evidence reused

The existing Raise feasibility run uses vault
`84953AA75CEBE50930F987E969D7918308B7C1471253DB0BD5E55CF3334C66DF` and share
MPT issuance `000000016D8E5748CD5FA882BDFF41D6619F430CF479D096`.

Successful atomic sale ([`4D4686…0F9`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/4D4686EA12DAD06318E95AC8537DA3975D63A0E04204809884570F195BF8D0F9),
ledger `65192`, `tesSUCCESS`) changed Bob's XRP by -1,000,000 drops and Alice's
shares by -450,000 units while Bob received 450,000 units. The outer fee was
60 drops and is separate from the economic legs. The before/after values are
preserved in `scripts/raise-feasibility/RESULTS.md`.

Forced-failure ([`EC8802…813`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/EC8802E7B6681977021E1778C6ABF89CDCBBA238031A4B01FCC237BB11918813),
ledger `65194`, outer `tesSUCCESS`) intentionally requested a 2,000,000,000
drop payment from Bob, which could not be funded. Neither the XRP payment nor
the 1-unit share transfer changed state. Alice's XRP decreased by only the
60-drop outer fee; Bob XRP and both share balances were unchanged. Therefore
outer `tesSUCCESS` alone is not treated as proof that both economic legs
succeeded; the validated metadata and before/after state are inspected.

## Signing and fee model

The buyer (Bob) signs the inner XRP `Payment` leg. The seller (Alice) signs the
outer `Batch`, which also carries Alice's inner share `Payment` leg. The
`signMultiBatch` helper creates the additional authorized signature object for
Bob; no third economic party is involved. The outer `Account` is Alice, so the
outer transaction fee (60 drops in the evidence) is paid by Alice. Each inner
transaction carries `tfInnerBatchTxn`. The buyer must first submit
`MPTokenAuthorize` for the share issuance, as proven by Issue #12; without that
holding opt-in, delivery returned `tecNO_AUTH`.

## Cancellation, expiry, and security

Listings and reservations live in the shared SQLite service; they are not
standing on-ledger DEX orders. The current coordinator in
[src/market-service.ts](../src/market-service.ts) records a reservation, immutable
prepared terms and the buyer's signature before awaiting seller approval. The
seller's exact signed blob and hash are persisted before the single broadcast
attempt. A server restart can therefore recover the same attempt without
asking either actor to approve new economic terms.

The current gateway sets `LastLedgerSequence` to the validated reservation
ledger index **plus 120**. This is a ledger bound, not a promised number of
minutes. Signing validation checks that bound and the offer terms; the
coordinator checks the listing's wall-clock expiry before storing approvals and
before claiming broadcast. Signed terms are never extended or rebuilt. The
original feasibility runs above did not rely on this newer expiry behavior.

Preparation validates the seller's fresh share position and buyer receipt
eligibility. Receipt permissions are checked again before broadcast. These are
preflight observations, not a ledger balance reservation: balances, sequence
availability and permissions can still change before execution. The ledger and
exact transaction proof determine the actual result.

An open listing can be cancelled or expire before preparation. Once reserved,
a failed, expired or uncertain signed attempt remains locked for investigation.
Listing cancellation and expiry cannot revoke a previously signed transaction.
There is no automatic rebooking, signed-transaction cancellation or blind
resubmission in this version.

## Integrated proof and public recovery

The server's [market-ledger.ts](../src/market-ledger.ts) verifier checks the exact
stored outer Batch hash and both expected inner Payment hashes. Each inner
transaction must be validated in the same ledger as the outer transaction,
reference it through `ParentBatchID`, report `tesSUCCESS`, and deliver the exact
recorded XRP or MPT amount. The validated ledger identity is also recorded.
API v2's `DeliverMax` presentation alias is normalized to serialized `Amount`
for inner hashing; conflicting amount fields are rejected. A successful outer
result alone never marks the offer settled.

Public snapshots expose prepared terms while signatures are needed. After
submission they omit the complete signed Batch and blob; recovery uses the
recorded hash while the server retains the signed data for verification. Missing
or inconsistent history keeps an attempt pending. A validated outer failure is
recorded as failed and remains locked.

The complete current-version evidence is
[market-e2e.json](../evidence/market-e2e.json) for the real HTTP API path and
[browser-market-e2e.json](../evidence/browser-market-e2e.json) for independent
browser wallets. Local reproduction and its limits are in
[INTEGRATION.md](INTEGRATION.md). Public deployment validation is tracked
separately in [DEPLOYMENT.md](DEPLOYMENT.md).

If Batch is unavailable, Raise must disable trustless atomic settlement. A
clearly labelled manual/non-atomic prototype path may exist, but it must never
call two independent transfers atomic and may instead disable marketplace
execution entirely.

## Classification

Because Batch is an additional ledger primitive beyond the XLS-65/XLS-66
baseline, the team selected **Track 1 + Loaded** on September 12, 2026; see [the current scope decision](PRODUCT_SCOPE.md#10-track-and-flavour-scope). An explicit mentor confirmation is not recorded in this repository. Question for mentors: “We use a multi-account
all-or-nothing Batch to atomically settle XRP against transferable XLS-65 vault
shares. Would you classify this submission as Loaded?”

## Historical read-only reproduction

Run the read-only verifier (no seeds, signing, faucet, or writes):

```sh
cd scripts/settlement
npm install
npm run verify
```

It checks the public hashes, validated ledger indexes, transaction/result types,
Batch flags/signing participants, and the recorded economic state. The custom
Devnet endpoint must be DNS-resolvable; the hashes and sanitized fallback
evidence remain in `scripts/raise-feasibility/RESULTS.md` if it is temporarily
unavailable.
