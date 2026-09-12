# XLS-66 Loan Broker and Cover Baseline (Issue #6)

## Result

This baseline uses the validated Issue #5 Track 1 XRP vault rather than recreating it. The operator attached a real `LoanBroker`, configured lending and first-loss-cover parameters, and funded the resulting broker pseudo-account. All evidence is public ledger data; no wallet seed is stored here or read by the verifier.

- Environment: Track 1 custom Devnet, network ID `4001`
- SDK: `xrpl.js` `5.2.0`, pinned in `scripts/broker-baseline/package.json`
- WSS: `wss://lending-hackathon.dev.ripplex.io:51233`
- Vault ID: `84953AA75CEBE50930F987E969D7918308B7C1471253DB0BD5E55CF3334C66DF`

## Roles and permissions

| Role | Account in this evidence | Responsibility |
| --- | --- | --- |
| Operator / vault owner | `rNBD…hz3uB` | Owns the vault and submitted both broker configuration and first-loss cover deposit. The active `LoanBrokerSet` rule permits only the associated vault owner to create/configure the broker. |
| Lender | `rHmF…MxXag` (Issue #5) | Deposited XRP into the vault and owns vault-share MPT units. The lender did not submit either broker transaction and does not control the vault/broker configuration. |
| Borrower | not yet used | A later borrower will accept/draw/repay a loan; no borrower controls the vault or broker in this baseline. |

## Validated broker configuration

The operator submitted [`LoanBrokerSet`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/0C263EB01C5C0D72F58A0AD0095CF6D0C04E78608CAF827024538084F821C2C8) in validated ledger `66593`, result `tesSUCCESS`, fee `12` drops. It created broker `1143BB37017D3373A2E72F39D59C6A9DC6F63FB7392CF4C40B1B634E99F7E62A` with pseudo-account `rsAE…PpnA`.

| Parameter | Stored value | Meaning / observed choice |
| --- | ---: | --- |
| `VaultID` | `84953…4C66DF` | The Issue #5 XRP vault that supplies loan liquidity. |
| `DebtMaximum` | 9,000,000 drops | Maximum debt owed to the vault, including interest. It matches the vault’s then-available 9 XRP rather than assuming unlimited debt. |
| `ManagementFeeRate` | 1,000 | 1% of loan interest: units are 1/10 basis point. |
| `CoverRateMinimum` | 10,000 | 10% of `DebtTotal`: units are 1/10 basis point. This is the minimum cover policy for issuing later loans. |
| `CoverRateLiquidation` | 10,000 | 10% of the required cover is the configured maximum cover contribution upon default. |

The operator XRP balance changed from `984,000,000` to `983,999,988` drops: exactly the 12-drop transaction fee. The validated broker entry identifies the same operator as `Owner` and the same vault as `VaultID`.

## First-loss-cover rule and funded proof

The active XLS-66 model makes cover optional when configured with a zero rate. This broker deliberately has a nonzero `CoverRateMinimum`. The active minimum is `DebtTotal × CoverRateMinimum`; because `DebtTotal` was zero at broker creation, the immediate required minimum was zero. At the configured maximum debt of 9,000,000 drops, the 10% policy requires 900,000 drops of cover. The operator funded 1,000,000 drops (1 XRP), a 100,000-drop buffer above that cap-based threshold.

[`LoanBrokerCoverDeposit`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/C7EC8535ED48573624286775E7FDDE170E8E880A879D77F48269923485242838) validated in ledger `66601` with `tesSUCCESS` and a 12-drop fee.

| Observed field | Before | After |
| --- | ---: | ---: |
| Operator XRP | 983,999,988 | 982,999,976 |
| `LoanBroker.CoverAvailable` | 0 | 1,000,000 |
| Broker pseudo-account XRP | 0 | 1,000,000 |

The operator XRP delta is `-1,000,012` drops: 1,000,000 cover plus 12 fee. The live broker entry and pseudo-account balance both read 1,000,000 drops after validation. This proves actual funded XRP cover, not merely an intended setting.

## Reproduce / independently revalidate

The baseline verifier is read-only. It fetches both hashes, requires `validated=true`, fixed ledger indexes/types, and `tesSUCCESS`; verifies live broker attachment and cover; and derives cover deltas from validated transaction metadata. It signs nothing and requires no seed.

```sh
cd scripts/broker-baseline
npm install
npm run verify
```

The protocol meanings and valid ranges used above were cross-checked against the active server definitions and the official [LoanBroker reference](https://xrpl.org/docs/references/protocol/ledger-data/ledger-entry-types/loanbroker), [LoanBrokerSet reference](https://xrpl.org/docs/references/protocol/transactions/types/loanbrokerset), and [lending-protocol cover description](https://xrpl.org/docs/concepts/tokens/lending-protocol). Values and all claims of validation in this document come from the Track 1 ledger queries.

## Acceptance checklist

- [x] Compatible Track 1 environment and the existing Issue #5 vault used.
- [x] Broker attached to the correct vault and live ledger object verified.
- [x] Debt, management-fee, and explicit cover parameters configured with active protocol fields.
- [x] First-loss-cover rule determined; configured cover funded and proven in the broker and pseudo-account.
- [x] Operator, lender, and borrower roles/permissions documented.
- [x] Validated hashes, indexes, results, fees, explorer links, and sanitized before/after evidence saved.
