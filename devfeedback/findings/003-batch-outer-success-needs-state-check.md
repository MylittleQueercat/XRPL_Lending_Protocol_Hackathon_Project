# Batch outer success must be interpreted with inner-leg state evidence

## Category

SDK / expectation

## Severity

High

## Attempt

Settle Bob's XRP payment and Alice's vault-share MPT delivery using a two-account `tfAllOrNothing` Batch, then run an intentionally unfunded payment leg.

## Expected result

Developers need a clear way to distinguish outer Batch acceptance and fee charging from actual economic-leg execution.

## Actual result

The forced-failure Batch validated with outer `tesSUCCESS` and charged the 60-drop outer fee, while Bob XRP and both share balances were unchanged. The success case changed both legs in the same validated ledger.

## Reproduction steps

1. Prepare a two-account `tfAllOrNothing` Batch containing an XRP Payment and a vault-share MPT Payment.
2. Sign the Bob inner transaction and Alice's outer Batch transaction.
3. For the failure case, use a legal XRP amount that exceeds Bob's balance.
4. Compare validated before/after balances for both economic legs; do not infer execution from the outer result alone.

## Environment and exact versions

- xrpld `3.4.0-rc1`; network ID `4001`.
- `xrpl.js` 5.2.0.

## Transaction / explorer / code / logs

- Successful sale: `4D4686EA12DAD06318E95AC8537DA3975D63A0E04204809884570F195BF8D0F9`, ledger `65192`.
- Forced failure: `EC8802E7B6681977021E1778C6ABF89CDCBBA238031A4B01FCC237BB11918813`, ledger `65194`.
- Full before/after evidence and runner: `scripts/raise-feasibility/RESULTS.md`, `scripts/raise-feasibility/run.mjs`.

## Impact

Checking only the outer result can produce a false positive for an atomic sale and obscure the fee charged for the attempted Batch.

## Proposed improvement

Expose per-inner execution outcomes prominently in SDK results and document a standard balance-delta verification pattern for Batch workflows.

## Resolution / workaround

Inspect validated metadata and compare both payment and MPT balances before and after each Batch. Include the outer fee in expected account deltas.

## Further cases confirming the same pattern

Verifying the settlement guarantees for issue #15 produced two more instances of an outer `tesSUCCESS` over an inner no-op, reproducible with `npm run settlement` and recorded in [`evidence/settlement-failures.json`](../../evidence/settlement-failures.json):

| Case | Outer result | XRP moved | Shares moved |
|---|---|---|---|
| Buyer cannot pay the price | `tesSUCCESS` | none (60-drop outer fee only) | none |
| Seller no longer holds the shares offered | `tesSUCCESS` | none (60-drop outer fee only) | none |
| Reference sale, both legs fundable | `tesSUCCESS` | 5 XRP | 1,000,000 units |
| Identical signed Batch resubmitted | `tefPAST_SEQ` | none | none |

The atomicity guarantee held in every case, including the one where the seller had already moved the shares elsewhere — the buyer was never debited for an undeliverable position. Replay is prevented by the outer account sequence rather than by anything Batch-specific.

The point stands and is now backed by three independent failure shapes: **the outer engine result reports acceptance and fee charging, never inner-leg execution.** Three of the four rows above share the same outer code while differing completely in economic effect. An application reading that code alone cannot tell a completed sale from one that never happened.


## Public or private-security

Public
