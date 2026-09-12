# XLS-65 XRP Vault Baseline (Issue #5)

> Historical standalone evidence. SDK versions and transaction results below describe the original reproduction project and are intentionally preserved. For the current beta.1 application, shared marketplace and complete browser journey, start with [INTEGRATION.md](INTEGRATION.md).

## Result

Issue #5 is satisfied by the existing validated Track 1 feasibility chain. This document keeps the vault-only proof separate from the broader Raise secondary-market spike; no duplicate Devnet transactions were submitted.

- Environment: Track 1 custom Devnet, network ID `4001`
- SDK: `xrpl.js` `5.2.0`, pinned in `scripts/vault-baseline/package.json`
- RPC/WSS: `https://lending-hackathon.dev.ripplex.io:51234` / `wss://lending-hackathon.dev.ripplex.io:51233`
- Explorer: `https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/`

All values below are sanitized public ledger data in drops or integer MPT units. No seed is recorded or required by the verifier.

## Vault configuration and share MPT

The owner `rNBD…hz3uB` created vault `84953A…4C66DF` in ledger `65180` with a [`VaultCreate`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/903AD65787F0537FD300B4641BB7FF43AA29C9DD5099CC331F3F99C78B76C186) transaction:

- `Asset`: XRP
- `WithdrawalPolicy`: `1` (the submitted open-ended policy)
- `Flags`: `0`
- `ShareMPTID`: `000000016D8E5748CD5FA882BDFF41D6619F430CF479D096`
- Share-MPT issuance flags observed by the original runner: `56`: `CanTrade=true`, `CanTransfer=true`, `RequireIssuerAuth=false`.
- Result: `tesSUCCESS`; transaction fee: `2,000,000` drops (2 XRP). The owner’s observed balance changed from `986,000,000` to `984,000,000` drops.

Transferability is not inferred from the flag alone: the share Payment below delivered real MPT units to a different account, and that recipient later redeemed them.

## Deposit, actual share units, and scaling observation

`rHmF…MxXag` (Alice), distinct from the vault owner, deposited `10,000,000` drops (10 XRP) in ledger `65184`: [`95E6…55D`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/95E6D36442EBB9D36550C1D54DB88871B6BD7AE5443C71E4348436AE3D59655D). It validated with `tesSUCCESS` and charged `12` drops.

| Observed field | Before | After |
| --- | ---: | ---: |
| Alice XRP | 941,999,700 | 931,999,688 |
| Alice share MPT units | no holding | 10,000,000 |
| Vault `AssetsAvailable` / `AssetsTotal` | 0 | 10,000,000 |
| Share issuance outstanding amount | 0 | 10,000,000 |

The XRP change is exactly `-10,000,012` drops: 10,000,000 deposited plus the 12-drop fee. For this exact empty-vault deposit, issued share units equaled deposited XRP drops (10,000,000 : 10,000,000). This is an observed ledger result, not a general conversion rule or assumption about future deposits, fees, rounding, or non-empty vaults.

## Transfer and redemption proof

Before redemption, Alice sent `1,000,000` real share-MPT units to Bob (`rKqW…Utin5`) with a successful [`Payment`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/221B4E9EEECAC4AA5AF7FDEA1F97F41614899C24BECDA6B43712ED463D3AC8FD) in ledger `65186`; it cost Alice 12 drops. Alice’s holding changed from 10,000,000 to 9,000,000 and Bob’s changed from 0 to 1,000,000. Bob had first created the required MPT holding with successful [`MPTokenAuthorize`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/D114AB7BAB7A9F4997707E73024F591442C0FB27385AFCE497DA1DC707CBB48F), ledger `65182`, fee 12 drops.

Bob then redeemed those received shares using [`VaultWithdraw`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/4A35CB34B997E6A6B1E79299960AA40E790E5CA1F320E2DE2228A52AEE6C0AB8) in ledger `65188`:

| Observed field | Before | After |
| --- | ---: | ---: |
| Bob XRP | 1,001,999,868 | 1,002,999,856 |
| Bob share MPT units | 1,000,000 | 0 (holding deleted) |
| Vault `AssetsAvailable` / `AssetsTotal` | 10,000,000 | 9,000,000 |
| Share issuance outstanding amount | 10,000,000 | 9,000,000 |

The withdrawal requested 1,000,000 drops, burned/redeemed 1,000,000 share units, and charged a 12-drop fee. Bob’s net XRP increase was 999,988 drops (`1,000,000 - 12`). This accounts for the fee explicitly; no undocumented rounding was observed in this exact operation.

## Reproduce / independently revalidate

The verifier is intentionally read-only: it makes no account, needs no faucet, signs nothing, and cannot expose or write seeds. It fetches the five public transaction hashes, requires `validated=true`, expected ledger indices/types, and `tesSUCCESS`, then derives the deposit and withdrawal values from transaction metadata.

```sh
cd scripts/vault-baseline
npm install
npm run verify
```

For a genuinely fresh disposable-account run, use `npm run run`. It creates exactly this five-operation baseline, generates or reuses only `wallets.json` with mode `0600`, and excludes that seed file from Git. It saves sanitized public output to `fresh-results.json`. Issue #5 does not need another transaction chain while the validated evidence above remains available.

## Acceptance checklist

- [x] Open-ended XRP vault created and validated.
- [x] Transferable share MPT proven by an actual Payment and redemption by its recipient.
- [x] Distinct lender deposited XRP.
- [x] Real `ShareMPTID`, issued units, outstanding amount, and exact-run scaling observed.
- [x] Redemption verified with holder shares, XRP, vault liquidity, issuance outstanding amount, and fees before/after.
- [x] Every material operation has a validated hash, ledger index, result, explorer link, and sanitized values.
