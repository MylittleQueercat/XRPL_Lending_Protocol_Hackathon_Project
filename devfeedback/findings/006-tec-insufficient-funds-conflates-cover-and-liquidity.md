# tecINSUFFICIENT_FUNDS conflates broker cover shortfall with vault liquidity shortfall

## Category

UX / error messages

## Severity

Medium

## Attempt

Originate a 50 XRP loan through a broker whose `CoverRateMinimum` was 100 %, with only 20 XRP of first-loss cover deposited, against a vault holding 100 XRP.

## Expected result

A code distinguishing "the broker's first-loss cover is below its own minimum" from "the vault has no cash".

## Actual result

`tecINSUFFICIENT_FUNDS`. The vault was not short of anything — it held twice the principal. Only the broker cover was short. The identical code is returned when a `VaultWithdraw` exceeds available vault liquidity, which is a genuinely different condition.

## Reproduction steps

1. Create an open-ended vault and deposit 100 XRP.
2. Create a broker with `CoverRateMinimum: 100000` (100 %) and deposit only 20 XRP of cover.
3. Submit a `LoanSet` for 50 XRP principal. It returns `tecINSUFFICIENT_FUNDS` despite the vault holding 100 XRP.
4. Separately, fund cover adequately, originate, then submit a `VaultWithdraw` exceeding available liquidity. It returns the same `tecINSUFFICIENT_FUNDS` for an unrelated reason.

## Environment and exact versions

- `xrpl.js` 5.2.0-beta.1, `rippled` 3.4.0-rc1, network ID 4001.

## Transaction / explorer / code / logs

Liquidity shortfall on `VaultWithdraw`, the deliberate guardrail in our flow: `A35CB5DC2235104B54F6B29DB48118013F836F9F96DA319ED103CCA846A1A028`. Cover shortfall on `LoanSet` reproduces with the parameters above. Both recorded against [`evidence/vanilla-flow.json`](../../evidence/vanilla-flow.json).

## Impact

An application cannot tell a borrower "the broker needs more cover" apart from "this vault is out of cash" without re-reading the `LoanBroker` object and re-deriving the cover ratio itself. Those two messages lead the user to opposite actions: one is the broker's problem, the other is the vault's. For Raise the distinction is load-bearing, because a liquidity shortfall is exactly the condition that should route a lender to the secondary market, while a cover shortfall should not.

## Proposed improvement

A distinct code for the cover shortfall, for example `tecINSUFFICIENT_COVER`.

## Resolution / workaround

Read the `LoanBroker` ledger object and compare `CoverAvailable` against `CoverRateMinimum × DebtTotal` before attributing the rejection. Our flow asserts cover equals the validated deposit so the two causes can never be confused in our own evidence.

## Public or private-security

Public.
