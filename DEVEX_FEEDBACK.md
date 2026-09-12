# Manual developer-feedback report — team Raise

| Field | Value |
|---|---|
| Track | 1, open-ended Single Asset Vault |
| Flavour | Vanilla |
| Protocol targeted | Lending Protocol V1 |
| Protocol actually enabled | `LendingProtocol` **and** `LendingProtocolV1_1`, both enabled |
| Network | Custom Hackathon Devnet, network ID 4001, `rippled` 3.4.0-rc1 |
| Endpoints | `wss://lending-hackathon.dev.ripplex.io:51233`, `https://lending-hackathon.dev.ripplex.io:51234` |
| Library | `xrpl.js` 5.2.0-beta.1 (exact, committed lockfile). The §1 accounting measurement was taken with 5.2.0 stable; it is a ledger property and is unaffected by the client version. |
| Runtime | Node.js 24.21.0 |
| Date | September 12, 2026 |
| Evidence | [`evidence/vanilla-flow.json`](evidence/vanilla-flow.json), [`evidence/vault-smoke.json`](evidence/vault-smoke.json) |

Every claim below is backed by a validated transaction on network 4001. Reproduce the whole set with `npm run vanilla`.

---

## 1. The Track 1 network runs V1.1 accounting, which the track description does not

**Category:** other (network configuration) · **Severity:** high

**Attempted:** run the Track 1 flow described by the event: an open-ended vault under Lending Protocol V1.

**Expected:** a V1 environment. The event's own annex anticipated the risk and stated that enabling V1.1 on the same ledger *"would restrict new loans to closed-ended vaults."*

**Actual:** `LendingProtocolV1_1` is enabled on the Track 1 endpoint. The predicted consequence does **not** occur: open-ended origination succeeds. What changes instead is interest recognition.

**Reproduction:**

1. `feature` on the RPC endpoint returns `LendingProtocolV1_1` with `enabled: true`.
2. Create an open-ended vault, deposit 800 XRP, and read `AssetsTotal` — 800.000000 XRP.
3. Originate a 400 XRP loan at 100 % annualised over 12 monthly instalments. The `Loan` object reports `TotalValueOutstanding` of 644.187932 XRP, so 244.19 XRP of scheduled interest exists.
4. Read `AssetsTotal` again — still exactly 800.000000 XRP.

Under V1 whole-life accounting, step 4 would have shown roughly 1044 XRP. It did not move by a single drop, so interest is realised on payment (cash basis).

**Impact:** teams following the Track 1 brief will document yield on the wrong accounting model, and any share-price or position-value calculation derived from `AssetsTotal` behaves differently from the V1 documentation they were pointed at. We lost time proving which model was live because the configuration and the brief disagreed.

**Proposed fix:** either disable `LendingProtocolV1_1` on the Track 1 ledger, or state in the track description that Track 1 runs V1.1 accounting with open-ended vaults, and link the V1.1 accounting note rather than the V1 pages. A one-line `server_info` field naming the active lending protocol version would remove the guesswork entirely.

---

## 2. `GracePeriod` below 60 seconds fails with an opaque `temINVALID`

**Category:** client libraries · **Severity:** high

**Attempted:** submit a `LoanSet` with `PaymentInterval: 60` and `GracePeriod: 30`.

**Expected:** either acceptance, or a client-side validation error naming the offending field — the pattern `validateLoanSet` already uses for every other bound.

**Actual:** `xrpl.js` accepts the transaction and the ledger returns `temINVALID: The transaction is ill-formed.` The message names no field. `LoanSet` carries 20 optional parameters, so the search space is large, and the dual-signature construction is an obvious suspect — we spent our time there before finding the real cause.

**Reproduction:** build any otherwise valid `LoanSet` with `GracePeriod` under 60 and submit it to network 4001.

**Cause (verified):** `node_modules/xrpl/dist/npm/models/transactions/loanSet.js` enforces `MIN_PAYMENT_INTERVAL = 60` for `PaymentInterval` and checks `GracePeriod <= PaymentInterval`, but never checks a lower bound on `GracePeriod`. The ledger does.

**Proposed fix:** add the symmetric check to `validateLoanSet`:

```js
if (tx.GracePeriod != null && tx.GracePeriod < MIN_GRACE_PERIOD) {
  throw new ValidationError(`LoanSet: GracePeriod must be greater than or equal to ${MIN_GRACE_PERIOD}`);
}
```

Independently, `temINVALID` on lending transactions should name the field that failed. We are happy to open the pull request.

---

## 3. `tecINSUFFICIENT_FUNDS` means two unrelated things on `LoanSet`

**Category:** UX (error messages) · **Severity:** medium

**Attempted:** originate a 50 XRP loan through a broker whose `CoverRateMinimum` was 100 %, with 20 XRP of cover deposited, against a vault holding 100 XRP.

**Expected:** a code distinguishing "the broker's first-loss cover is below its own minimum" from "the vault has no cash".

**Actual:** `tecINSUFFICIENT_FUNDS`. The vault was not short of anything — it held twice the principal. Only the broker cover was short. The same code is returned when a `VaultWithdraw` exceeds available vault liquidity, which is a genuinely different condition and the one we deliberately demonstrate as our guardrail.

**Reproduction:** compare these two validated transactions on network 4001, both returning `tecINSUFFICIENT_FUNDS` for different reasons:

- cover shortfall on `LoanSet`, reproducible by setting `CoverRateMinimum: 100000` with 20 XRP of cover
- liquidity shortfall on `VaultWithdraw`, hash `A35CB5DC2235104B54F6B29DB48118013F836F9F96DA319ED103CCA846A1A028`

**Impact:** an application cannot tell the borrower "the broker needs more cover" apart from "this vault is out of cash" without re-reading ledger objects and re-deriving the cover ratio itself. Those messages lead to opposite user actions.

**Proposed fix:** a distinct code for the cover shortfall, for example `tecINSUFFICIENT_COVER`.

---

## 4. Demonstrating "capital plus accrued yield" is not achievable in an event window

**Category:** missing primitive · **Severity:** medium

**Attempted:** satisfy Track 1 minimum-bar item 6, "withdraw capital plus accrued yield", with a visible, non-trivial yield.

**Expected:** some way to show a lender redeeming meaningfully more than they deposited.

**Actual:** yield is bounded by `principal x rate x elapsed time`, `InterestRate` is capped at 100 % annualised, and the ledger follows wall-clock time. Our 50 XRP loan held open for 120 seconds produced **188 drops** of yield against **190** predicted by the contract's own formula, the gap being ledger close timing. The mechanism is exactly right; the magnitude is dust. Reaching 1 XRP of interest requires principal x time on the order of one XRP-year.

Two routes that look like workarounds do not work, and we verified both:

- **Early full payment does not accelerate interest.** `LoanPay` with `tfLoanFullPayment` charges principal plus interest accrued *to date*, not the remaining schedule. The ledger caps the charge at what is owed: we offered 241.570476 XRP against a `TotalValueOutstanding` of 80.523492 XRP and the borrower was debited 55.000188 XRP. The cap is good behaviour and worth documenting explicitly.
- **`ClosePaymentFee` does not reach the vault.** On the recorded run the borrower was charged 55.000188 XRP, the vault received 50.000188 XRP, and the 5 XRP prepayment fee went to the broker. Prepayment charges therefore cannot stand in for lender yield, and the split is worth documenting.

**Impact:** every Track 1 team either reports a yield indistinguishable from rounding, or quietly presents a simulated figure. The judging criteria reward on-chain evidence, so the honest option looks weaker than it is.

**Proposed fix:** either relax the `InterestRate` cap on hackathon devnets, or provide a ledger time-acceleration facility on those networks, or restate the minimum bar as "demonstrate the yield mechanism and reconcile it against the contract formula" — which is achievable and actually more rigorous. We report observed against expected accrual in `evidence/vanilla-flow.json` for exactly this reason.

---

## 5. Non-standard ports make the devnet unreachable on restricted networks

**Category:** other (infrastructure) · **Severity:** medium

**Attempted:** reach the RPC and WebSocket endpoints from the venue network.

**Expected:** connectivity, since the faucet and explorer were both reachable.

**Actual:** every endpoint on ports 51233 and 51234 timed out while every endpoint on port 443 worked. TCP connects appeared to succeed and then no data ever arrived, which reads like a node outage and sent us looking in the wrong place.

**Reproduction and isolation:** we confirmed the cause with controls rather than assuming it.

| Target | Port | Result |
|---|---|---|
| `lending-hackathon-faucet.dev.ripplex.io` | 443 | reachable |
| `custom.xrpl.org` explorer | 443 | HTTP 200 |
| `xrplcluster.com` | 443 | HTTP 200, `build_version` 3.3.0 |
| `xrplcluster.com` | 51234 | timeout |
| `lending-hackathon.dev.ripplex.io` | 51233 / 51234 | timeout |
| `s.devnet.rippletest.net` | 51234 | timeout |
| `portquiz.net` | 8080 | timeout |

Three independent networks and a neutral port-test host all failed on non-standard ports while port 443 worked everywhere, so the cause was outbound port filtering, not any XRPL service.

**Impact:** roughly an hour lost, and the failure mode actively misleads — it looks exactly like a devnet outage.

**Proposed fix:** publish a port-443 endpoint for hackathon devnets, and add a troubleshooting line to the event instructions: if the faucet works but RPC and WSS time out, test port 443 against `xrplcluster.com` before reporting an outage.

---

## What worked well

- `signLoanSetByCounterparty` and `combineLoanSetCounterpartySigners` make the two-party origination tractable, and the error `Transaction must be first signed by first party` states the required order precisely once you hit it. Documenting that ordering next to the `LoanSet` reference would save the discovery step.
- The ledger capping `LoanPay` at the amount actually owed is a strong safety property. It deserves to be stated in the `LoanPay` documentation rather than discovered.
- `VaultCreate`, `VaultDeposit` and `VaultWithdraw` behaved exactly as documented, first try, with no surprises in share issuance or transferability flags.
- The reference lending application was the fastest path to a correct `LoanSet`, more so than the specification text. Linking it from the `LoanSet` reference page would help.
