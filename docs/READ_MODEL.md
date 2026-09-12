# Validated positions and exact share valuation

The read model is the data foundation for the investor and market screens. It is read-only: it does not request faucet funds, accept seeds, sign transactions or submit transactions. It targets the configured hackathon network (4001) and currently values XRP vaults only.

## Read a position

```sh
npm run position -- \
  --vault 919E2B6F06793FA34516CBF6A6FBFD3F184C6C0D009290193980B479C7434C59 \
  --account rLNzsCg1LPnytzSdf4hLk7inC58BFzuX6J \
  --broker 694ACA36028D94BB1D8E902009F9ACCA683DE212FB7796B6C90BC8A0E5168E6B \
  --loan 67A5515AE007BDC3CE836D538D67E6296D41E83DE7ADBB981A901A19B40FD944
```

These public identifiers come from `evidence/vanilla-flow.json`. That lender redeemed its position, so the current holding and valuation can legitimately be zero. The ledger can reset; a missing historical object is reported as an error rather than fabricated state.

`--broker` and `--loan` are optional. If a loan is supplied, a broker is required so the reader can verify the vault → broker → loan relationship. Include `--shares RAW --price XRP` together to compare a proposed sale with the accounting value of the offered quantity. `--shares` is an integer quantity of raw MPT units; `--price` is the total asking payment in XRP, not a per-share price.

## Snapshot consistency

All objects and holder pagination are pinned to one validated ledger hash. The result exposes the ledger index/hash, freshness and the underlying vault, issuance, holder, broker and loan data. Missing zero-valued ledger fields are normalized according to their semantics; malformed or mismatched responses fail explicitly.

The reusable reader serializes operations to avoid an older response replacing a newer snapshot. It rejects stale ledgers, mixed ledger responses and the wrong network. A detected ledger regression or conflicting hash invalidates session state. A transient read can be retried within the configured bound; no financial operation is replayed. A snapshot must be refreshed after reconnection before presenting a current position.

## Valuation contract

`valuePosition()` accepts decimal and scientific-notation strings for XRP accounting amounts in drops and integer strings for raw share quantities. It uses `bigint` arithmetic; no monetary value is converted through a JavaScript floating-point number. Share `AssetScale` changes display units only. The ownership ratio always uses raw held shares divided by raw outstanding supply.

| Output | Meaning |
|---|---|
| `netAssetValueDrops` | Vault assets total less unrealized losses. |
| `accountingClaimDrops` | The holder's proportion of net asset value, floored to whole drops. |
| `withdrawalValueEstimateDrops` | A separate withdrawal-value estimate including the documented sole-holder loss exception where applicable. |
| `liquidityLimitedWithdrawalEstimateDrops` | The withdrawal-value estimate capped by available vault cash, floored to whole drops. |
| `heldSharesDisplay` / `totalSharesDisplay` | Share quantities formatted using the actual issuance scale. |
| `offeredAccountingClaimDrops` | Net accounting value of just the offered shares. |
| `askingDiscountBps` | Discount to the exact offered accounting value in basis points; a negative value is a premium. |

Discounts use the exact rational claim before its display value is floored. Basis points are truncated toward zero. If the net accounting value is zero, a discount is undefined and returned as `null`. An empty vault produces a zero position; inconsistent quantities are rejected.

XLS-65 distinguishes net NAV from the special withdrawal treatment of the sole outstanding shareholder. `soleHolderLossWaiverApplied` exposes that distinction rather than silently applying it to a sale price. This is a documented estimate, not proof that a deployed network will accept a withdrawal. Authorization, locks, lifecycle phases, protocol execution rounding, fees and later state changes can affect redemption. A liquidity cap does not mean a larger withdrawal transaction will partially fill.

These values are not guaranteed proceeds or future yield. See [XLS-65 accounting and withdrawal semantics](https://github.com/XRPLF/XRPL-Standards/blob/master/XLS-0065-single-asset-vault/README.md).

## Track a known transaction

```sh
npm run transaction -- --hash AD0280823EBD6910BC95F95E726D46C3542C645B9392AD3A058436A64598EE87
```

For an unvalidated transaction, supply `--last-ledger INDEX` when the signed transaction's `LastLedgerSequence` is known. Each CLI invocation performs one bounded poll and exits. Applications can retain a `LedgerReader` instance to follow the lifecycle over multiple polls.

`beginTracking` records a caller-supplied submission marker; it is not evidence that this CLI submitted anything or that a server accepted it. Pending and validated outcomes remain distinct. A missing transaction is never interpreted as successful. Passing its expiry ledger without validated evidence is separate from a transaction with a validated failure result; it does not authorize blind resubmission.

A successful outer `Batch` result is not sufficient evidence that its payment and share legs executed. The reader reports ledger finality and leaves the economic outcome unverified; settlement must inspect both legs and their state changes separately.

## Verification

Offline tests cover monetary boundaries and losses, scaling, holder pagination, ledger consistency and freshness, transaction status changes, reset detection, retry behavior and CLI input validation. Live read evidence uses public accounts and transaction hashes only. Tests and read commands must not create wallets or send financial transactions.

[Read-only live evidence](../evidence/read-model.json) was captured on the hackathon network with xrpl.js `5.2.0-beta.1` on 2026-09-12. Both position snapshots use validated ledger **67358**: the redeemed lender holds zero shares, while the active lender holds `8450000` of `8900000` raw shares. A proposed payment of `950000` drops for `1000000` raw shares yields a **500 bps** discount to the accounting value. Separate reads distinguish the existing successful loan origination, failed withdrawal, and successful outer Batch whose economic settlement remains unverified.
