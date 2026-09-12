# Loan ledger objects carry fractional drop amounts, and the payoff amount cannot always be derived from chain state

## Category

Documentation / ledger object schema

## Severity

Medium

## Attempt

Build a borrower screen that shows a loan's periodic payment and total value outstanding, and lets the borrower pay off early with an exact amount computed from the ledger.

## Expected result

Loan amounts as integer drop strings like every other XRP amount on the ledger, and the fields needed to compute an early payoff present on the `Loan` object.

## Actual result

- `PeriodicPayment` and `TotalValueOutstanding` are **fractional drop strings** — for example `6710290.955601783635` — while `PrincipalOutstanding`, balances and every transaction amount are integers. Generic drop formatters throw or misrender; every consumer has to special-case these two fields.
- The `Loan` object does not always expose `ClosePaymentFee` (optional fields are omitted when zero), and the interest actually accrued to date is not a field at all. Early full payoff = principal + interest accrued to date + close fee; the borrower cannot compute that exactly from chain state, so the UI offers an upper bound and relies on the ledger capping the charge at what is owed.

## Reproduction steps

1. Originate a loan (`npm run vanilla` does) and read the `Loan` entry with `ledger_entry`.
2. Observe the fractional strings on `PeriodicPayment` and `TotalValueOutstanding`.
3. Attempt to compute the exact early-payoff amount from the object's fields alone.

## Environment and exact versions

- `rippled` 3.4.0-rc1, network ID 4001, `xrpl.js` 5.2.0-beta.1.

## Transaction / explorer / code / logs

Loan `67A5515AE007BDC3CE836D538D67E6296D41E83DE7ADBB981A901A19B40FD944` in [`evidence/vanilla-flow.json`](../../evidence/vanilla-flow.json): `periodicPaymentDrops` recorded as `6710290.955601783635`. The web app floors these once in `web/src/lib/ledger.ts` (`wholeDrops`) and offers `⌈TotalValueOutstanding⌉ + ClosePaymentFee` for early payoff.

## Impact

Two classes of bug for anyone building on XLS-66: formatters and BigInt math that assume integer drops break on `Loan` fields, and payoff screens either overpay knowingly (safe only because of the cap) or guess.

## Proposed improvement

State the fractional representation and its precision in the `Loan` object reference; expose an `AccruedInterest` (or `PayoffAmount`) computed field, or an RPC that returns the current payoff; and document that `LoanPay` caps the charge at what is owed, which makes the upper-bound approach safe.

## Resolution / workaround

Floor to whole drops at the read boundary; offer an upper bound for early payoff and rely on the documented-by-experiment cap; show the borrower the cap explanation.

## Public or private-security

Public.
