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

## Public or private-security

Public
