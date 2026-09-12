# Manual developer-feedback report — team Raise

| Field | Value |
|---|---|
| Track | 1, open-ended Single Asset Vault |
| Flavour | **Loaded**. The XLS-65 + XLS-66 Vanilla baseline is complete and independently reproducible (`npm run vanilla`); atomic settlement adds `Batch` (XLS-56), a primitive beyond that baseline — see [`docs/PRODUCT_SCOPE.md`](docs/PRODUCT_SCOPE.md) §10. |
| Protocol targeted | Lending Protocol V1 |
| Protocol actually enabled | `LendingProtocol` **and** `LendingProtocolV1_1`, both enabled — see finding 1 |
| Network | Custom Hackathon Devnet, network ID 4001, `rippled` 3.4.0-rc1 |
| Endpoints | `wss://lending-hackathon.dev.ripplex.io:51233`, `https://lending-hackathon.dev.ripplex.io:51234` |
| Library | `xrpl.js` 5.2.0-beta.1 (exact, committed lockfile). Findings 1 and 3 were measured with 5.2.0 stable and reproduce on both; they are ledger properties. |
| Runtime | Node.js 24.21.0 |
| Date | September 12, 2026 |

This report is the **curated selection** from our team evidence pool in [`devfeedback/findings/`](devfeedback/findings/), following the process in [`devfeedback/README.md`](devfeedback/README.md). Every claim is backed by a validated transaction on network 4001, recorded in [`evidence/vanilla-flow.json`](evidence/vanilla-flow.json), [`evidence/vault-smoke.json`](evidence/vault-smoke.json) and [`scripts/raise-feasibility/RESULTS.md`](scripts/raise-feasibility/RESULTS.md). Reproduce the lending set with `npm run vanilla`.

---

## 1. Track 1 runs V1.1 cash-basis accounting, which its own description does not

**Severity: High · documentation / network configuration · [full finding](devfeedback/findings/004-track1-runs-v1-1-accounting.md)**

The Track 1 endpoint has `LendingProtocolV1_1` enabled. The event annex anticipated this and predicted it would *"restrict new loans to closed-ended vaults."* It does not: open-ended origination succeeds. What changes is interest recognition.

Measured, not inferred: we created an open-ended vault, deposited 800 XRP, and originated a 400 XRP loan whose `Loan` object carried 244.19 XRP of scheduled interest. `AssetsTotal` stayed at **exactly 800.000000 XRP** at origination. Under V1 whole-life accounting it would have shown roughly 1044 XRP. Interest is therefore realised when a payment delivers it.

**Impact.** Teams following the brief will document yield on the wrong model, and any share price derived from `AssetsTotal` behaves unlike the V1 documentation they were pointed at — load-bearing for a secondary market that prices positions from vault accounting. We initially treated the amendment as a hard blocker purely on the documentation, and stopped building until we tested it.

**Proposed fix.** Disable V1.1 on the Track 1 ledger, or state in the track description that Track 1 runs V1.1 accounting with open-ended vaults. A `server_info` field naming the active lending protocol version would end the guesswork for every team.

---

## 2. `LoanSet` `GracePeriod` below 60 seconds fails with an opaque `temINVALID`

**Severity: High · client libraries · [full finding](devfeedback/findings/005-loanset-graceperiod-lower-bound-unvalidated.md)**

`xrpl.js` accepts a `LoanSet` with `GracePeriod: 30`; the ledger returns `temINVALID: The transaction is ill-formed`, naming no field.

**Verified cause.** `models/transactions/loanSet.js` enforces `MIN_PAYMENT_INTERVAL = 60` for `PaymentInterval` and checks `GracePeriod <= PaymentInterval`, but never checks a lower bound on `GracePeriod`. The ledger does.

**Impact.** This was our most expensive friction point. `LoanSet` carries 20 optional parameters and needs a two-party signature, so the dual-signature construction is the natural suspect — we investigated signing order and counterparty encoding before finding the cause by reading the SDK source. Any team building a short demo schedule will choose a small `GracePeriod` and hit it.

**Proposed fix.** Add the symmetric check, mirroring the existing bounds:

```js
if (tx.GracePeriod != null && tx.GracePeriod < MIN_GRACE_PERIOD) {
  throw new ValidationError(`LoanSet: GracePeriod must be greater than or equal to ${MIN_GRACE_PERIOD}`);
}
```

Separately, `temINVALID` on lending transactions should name the offending field. We will open the pull request.

---

## 3. A `Batch` outer `tesSUCCESS` does not mean the inner legs executed

**Severity: High · SDK / expectation · [full finding](devfeedback/findings/003-batch-outer-success-needs-state-check.md)**

Settling an XRP payment against a vault-share MPT delivery with a two-account `tfAllOrNothing` `Batch`, we ran an intentionally unfunded payment leg. The forced-failure `Batch` **validated with outer `tesSUCCESS`** and charged the 60-drop outer fee, while the XRP balance and both share balances were unchanged. The success case moved both legs in the same validated ledger.

**Impact.** Atomicity held exactly as promised — the guarantee is sound. But an application that reads the outer result alone will report a completed sale that never happened. For a marketplace settling payment against share delivery, that is the difference between a correct trade and a fabricated one.

**Proposed fix.** State prominently in the `Batch` documentation that the outer engine result reports acceptance and fee charging, not inner-leg execution, and give a canonical example of verifying inner effects from validated before/after state.

---

## 4. `tecINSUFFICIENT_FUNDS` conflates two unrelated conditions

**Severity: Medium · UX / error messages · [full finding](devfeedback/findings/006-tec-insufficient-funds-conflates-cover-and-liquidity.md)**

Originating a 50 XRP loan through a broker whose cover was below its own `CoverRateMinimum`, against a vault holding 100 XRP, returns `tecINSUFFICIENT_FUNDS`. The vault was short of nothing. The identical code is returned when a `VaultWithdraw` exceeds available vault liquidity — the guardrail we deliberately demonstrate (`A35CB5DC…`).

**Impact.** An application cannot separate "the broker needs more cover" from "this vault is out of cash" without re-reading the `LoanBroker` object and re-deriving the ratio. The two lead a user to opposite actions. For Raise the distinction is the product: a liquidity shortfall is precisely what should route a lender to the secondary market; a cover shortfall should not.

**Proposed fix.** A distinct code, for example `tecINSUFFICIENT_COVER`.

---

## 5. "Capital plus accrued yield" is not demonstrable within an event window

**Severity: Medium · missing primitive / event design · [full finding](devfeedback/findings/007-accrued-yield-unreachable-in-event-window.md)**

Yield is bounded by `principal × rate × elapsed time`; `InterestRate` caps at 100 % annualised and the ledger follows wall-clock time. Our 50 XRP loan held 120 seconds produced **188 drops** against **190** predicted by the contract formula. The mechanism is right, the magnitude is dust: 1 XRP of interest needs principal × time near one XRP-year.

We verified that the two apparent workarounds do not work. `LoanPay` with `tfLoanFullPayment` charges interest **accrued to date**, not the remaining schedule — and the ledger caps the charge at what is owed, debiting 55.000188 XRP against 241.570476 offered. Of that, the vault received 50.000188 XRP and the broker kept the 5 XRP `ClosePaymentFee`, so prepayment charges cannot substitute for lender yield either.

**Impact.** Every Track 1 team must choose between a yield indistinguishable from rounding and a simulated figure. The criteria reward verified on-chain evidence, so the honest choice scores worse — a scoring incentive worth correcting.

**Proposed fix.** Relax the rate cap on hackathon devnets, provide ledger time acceleration there, or restate the minimum bar as "demonstrate the yield mechanism and reconcile observed accrual against the contract formula" — achievable, and more rigorous than a large number.

---

## Also in the evidence pool

- **[No wallet can provide the second signature a `LoanSet` or a settlement `Batch` needs](devfeedback/findings/008-no-wallet-can-cosign-batch-or-loanset.md).** Neither `xrpl-connect` nor the wallets it wraps speaks to network 4001, and none exposes counterparty or inner-`Batch` signing; both signatures must land on the same autofilled object. The web app ships a browser-held local wallet instead, verified with a real validated payment (`evidence/web-wallet-signing.json`), and asks for the counterparty's test seed for two-party demos — acceptable for a demonstration, not for a product. The protocol's two defining transactions cannot yet be signed by two independent wallets.
- **[Non-standard ports break restricted networks](devfeedback/findings/001-network-path-connectivity-timeout.md).** Ports 51233/51234 timed out while port 443 worked, on three unrelated networks plus a neutral control host. Mainnet failing on 51234 and succeeding on 443 proved the access path, not any XRPL service, was filtering. TCP connected and then nothing arrived, so it reads exactly like a node outage. One diagnostic line in the event instructions — *if the faucet works but RPC times out, test `xrplcluster.com` on 443 and on 51234* — would save every affected team an hour.
- **[Vault-share recipients need an explicit MPT holder setup](devfeedback/findings/002-vault-share-holder-setup.md).** The buyer must submit `MPTokenAuthorize` before shares can be delivered. Worth stating in the share-transfer prerequisites.

## What worked well

- `signLoanSetByCounterparty` makes two-party origination tractable, and `Transaction must be first signed by first party` states the required order precisely. Documenting that ordering beside the `LoanSet` reference would remove the discovery step.
- The ledger capping `LoanPay` at the amount actually owed is a strong safety property that deserves to be documented rather than discovered.
- `VaultCreate`, `VaultDeposit` and `VaultWithdraw` behaved exactly as documented on first attempt, with no surprises in share issuance or transferability flags.
- The reference lending application was a faster path to a correct `LoanSet` than the specification text. Linking it from the `LoanSet` reference page would help the next team.
