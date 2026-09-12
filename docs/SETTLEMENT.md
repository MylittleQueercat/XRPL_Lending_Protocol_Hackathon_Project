# Payment-for-shares settlement (Issue #13)

## Decision

Raise selects a multi-account `Batch` with `tfAllOrNothing` for the sale of XRP
against transferable XLS-65 vault-share MPT units. The payment and share
delivery are inner transactions in one atomic ledger operation. Two independent
`Payment` transactions are explicitly **not** an atomic sale: either leg can
land while the other fails or is never submitted.

This is a real product requirement (payment-versus-delivery), not feature
stuffing. The Track 1 custom Devnet has `BatchV1_1` enabled and recognizes
`Batch` (transaction type 71), alongside `Payment` (0). The exact evidence was
produced with xrpl.js `5.2.0` in `scripts/raise-feasibility` (the root project
pins compatible `5.2.0-beta.1`). `SingleAssetVault`, `LendingProtocol`,
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

The current design submits a Batch immediately; it does not create a
persistent on-ledger marketplace order. There is therefore no standing atomic
order to cancel or expire. An off-chain listing can be cancelled or expire
before settlement. Immediately before signing/submitting, Raise must revalidate
seller share balance, buyer XRP funds, buyer MPT opt-in, listing validity, and
sequence/fee data. No Batch expiration fields were used or relied upon in the
validated implementation.

If Batch is unavailable, Raise must disable trustless atomic settlement. A
clearly labelled manual/non-atomic prototype path may exist, but it must never
call two independent transfers atomic and may instead disable marketplace
execution entirely.

## Classification

Because Batch is an additional ledger primitive beyond the XLS-65/XLS-66
baseline, the expected classification is **Track 1 + Loaded**; mentor
confirmation is pending. Question for mentors: “We use a multi-account
all-or-nothing Batch to atomically settle XRP against transferable XLS-65 vault
shares. Would you classify this submission as Loaded?”

## Reproduction

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
