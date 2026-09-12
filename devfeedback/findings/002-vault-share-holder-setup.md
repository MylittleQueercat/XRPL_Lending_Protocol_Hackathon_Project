# Vault-share recipient requires an explicit MPT holder setup step

## Category

Protocol / terminology

## Severity

Medium

## Attempt

Transfer an actual transferable vault-share MPT from Alice to Bob after Alice deposited into an open-ended vault.

## Expected result

The share-transfer prerequisites should clearly explain the recipient-side holder setup.

## Actual result

Bob first created an MPT holder object with `MPTokenAuthorize`; the subsequent Payment transferred 1,000,000 vault-share units, and Bob redeemed them successfully.

## Reproduction steps

1. Create an open-ended transferable XRP vault.
2. Have the recipient submit `MPTokenAuthorize` for the vault share issuance.
3. Deposit XRP, then send vault-share MPT units to that recipient.
4. Redeem the received shares with `VaultWithdraw`.

## Environment and exact versions

- xrpld `3.4.0-rc1`; network ID `4001`.
- `xrpl.js` 5.2.0.

## Transaction / explorer / code / logs

- Holder setup: `D114AB7BAB7A9F4997707E73024F591442C0FB27385AFCE497DA1DC707CBB48F`.
- Transfer: `221B4E9EEECAC4AA5AF7FDEA1F97F41614899C24BECDA6B43712ED463D3AC8FD`.
- Redemption: `4A35CB34B997E6A6B1E79299960AA40E790E5CA1F320E2DE2228A52AEE6C0AB8`.
- Full before/after evidence: `scripts/raise-feasibility/RESULTS.md`.

## Impact

An undeclared holder setup requirement can make a valid secondary-share transfer appear unsupported.

## Proposed improvement

Add a recipient-readiness checklist and an SDK helper that detects or creates the required holder object before an MPT Payment.

## Resolution / workaround

Submit `MPTokenAuthorize` for the recipient before share delivery; recreate it after a full redemption removes the zero-balance holding.

## Public or private-security

Public
