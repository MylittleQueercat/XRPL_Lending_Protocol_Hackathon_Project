# Demonstrating "capital plus accrued yield" is not reachable within an event window

## Category

Missing primitive / event design

## Severity

Medium

## Attempt

Satisfy Track 1 minimum-bar item 6, "withdraw capital plus accrued yield", with a visible, non-trivial yield.

## Expected result

Some route to showing a lender redeeming meaningfully more than they deposited, within the hours available at the event.

## Actual result

Yield is bounded by `principal × rate × elapsed time`. `InterestRate` is capped at 100000 (100 % annualised) and the ledger follows wall-clock time with no acceleration. A 50 XRP loan held open for 120 seconds produced **188 drops** against **190** predicted by the contract formula. The mechanism is exactly right; the magnitude is dust. Reaching 1 XRP of interest needs principal × time on the order of one XRP-year.

## Reproduction steps

1. Originate a loan at the maximum `InterestRate` of 100000.
2. Hold it open for any duration realistically available during the event.
3. Repay and redeem; compare the lender's redemption against their deposit.

Two apparent workarounds do not work, and we verified both rather than assuming:

4. **Early full payment does not accelerate interest.** `LoanPay` with `tfLoanFullPayment` charges principal plus interest accrued *to date*, not the remaining schedule. The ledger caps the charge at what is owed: we offered 241.570476 XRP against a `TotalValueOutstanding` of 80.523492 XRP and the borrower was debited 55.000188 XRP.
5. **`ClosePaymentFee` does not reach the vault.** Of that 55.000188 XRP, the vault received 50.000188 XRP and the broker kept the 5 XRP prepayment fee. Prepayment charges cannot stand in for lender yield.

## Environment and exact versions

- `xrpl.js` 5.2.0-beta.1, `rippled` 3.4.0-rc1, network ID 4001.

## Transaction / explorer / code / logs

`LoanPay` `CE8D8C80F2270A004E8BA61239DBE60875F9965B40846C4D843B32B88AA21F69`, redemption `2D4276038162C1B1A75E0460BFAC4FB13A02319588E13860980E3CA8D56B2EFC`. Observed and expected accrual are both recorded under `interestAccrual` in [`evidence/vanilla-flow.json`](../../evidence/vanilla-flow.json).

## Impact

Every Track 1 team faces the same choice: report a yield indistinguishable from rounding, or quietly present a simulated figure. The judging criteria reward verified on-chain evidence, so the honest option looks weaker than the dishonest one. That is a scoring incentive worth correcting.

Two behaviours found along the way deserve documentation on their own merits: the ledger capping `LoanPay` at the amount actually owed is a strong safety property, and the destination of `ClosePaymentFee` is not obvious from the specification.

## Proposed improvement

Either relax the `InterestRate` cap on hackathon devnets, or provide ledger time acceleration on those networks, or restate the minimum bar as "demonstrate the yield mechanism and reconcile observed accrual against the contract formula" — which is achievable and more rigorous than a large number would be.

## Resolution / workaround

We hold the loan open for a configurable interval (`RAISE_LOAN_HOLD_SECONDS`, default 120) and report observed accrual against the value the contract's own formula predicts, rather than presenting a figure we cannot substantiate.

## Public or private-security

Public.
