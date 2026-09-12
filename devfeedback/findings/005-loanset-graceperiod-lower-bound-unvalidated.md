# LoanSet GracePeriod below 60 seconds fails with an opaque temINVALID

## Category

Client libraries

## Severity

High

## Attempt

Submit a `LoanSet` with `PaymentInterval: 60` and `GracePeriod: 30`.

## Expected result

Either acceptance, or a client-side validation error naming the offending field — the pattern `validateLoanSet` already applies to every other bound it checks.

## Actual result

`xrpl.js` accepts the transaction. The ledger returns `temINVALID: The transaction is ill-formed.` The message names no field.

## Reproduction steps

1. Build an otherwise valid `LoanSet` with `GracePeriod` below 60.
2. Sign it by the Account, counter-sign with `signLoanSetByCounterparty`, submit to network 4001.
3. Observe `temINVALID` with no indication of which of the 20 optional parameters is at fault.

## Environment and exact versions

- `xrpl.js` 5.2.0 and 5.2.0-beta.1, both affected.
- `rippled` 3.4.0-rc1, network ID 4001.

## Transaction / explorer / code / logs

Verified cause in `node_modules/xrpl/dist/npm/models/transactions/loanSet.js`: the validator enforces `MIN_PAYMENT_INTERVAL = 60` for `PaymentInterval` and checks `GracePeriod <= PaymentInterval`, but never checks a lower bound on `GracePeriod`. The ledger does.

```
temINVALID: The transaction is ill-formed.
```

## Impact

This was the single most expensive friction point of our build. `LoanSet` carries 20 optional parameters and requires a two-party signature, so the dual-signature construction is the natural suspect — we investigated signing order and counterparty encoding before finding the real cause by reading the SDK source. A field-level message, or the missing client check, would have saved the whole detour. Any team attempting a short demo schedule will pick a small `GracePeriod` and hit this.

## Proposed improvement

Add the symmetric check to `validateLoanSet`:

```js
if (tx.GracePeriod != null && tx.GracePeriod < MIN_GRACE_PERIOD) {
  throw new ValidationError(`LoanSet: GracePeriod must be greater than or equal to ${MIN_GRACE_PERIOD}`);
}
```

Independently, `temINVALID` on lending transactions should name the field that failed. We are happy to open the pull request.

## Resolution / workaround

Keep `GracePeriod` at 60 or above and no greater than `PaymentInterval`. Our flow asserts both bounds in `tests/lending.test.ts` so the constraint cannot regress silently.

## Public or private-security

Public.
