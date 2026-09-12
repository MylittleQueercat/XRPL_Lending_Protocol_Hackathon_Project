# Partial fills: tested exploration

Issue #30 explores splitting one secondary-market listing into several independently settled purchases. The prototype now includes exact pricing, a state model, SQLite persistence, and an adapter to the existing Batch verification path. It is deliberately not exposed by the production marketplace API or interface. Current users still trade whole listings.

## Pricing and remaining quantity

The original listing has `S` raw shares and an asking price of `P` XRP drops. After `F` shares have settled, the next fill of `Q` shares is quoted as:

```text
fill price = floor(P × (F + Q) / S) − floor(P × F / S)
remaining shares = S − F − Q
remaining price = P − floor(P × (F + Q) / S)
```

All calculations use integer strings and `bigint`. A quote allocating zero drops is rejected; the buyer must request a larger quantity. This prevents free payment legs and keeps the sum of completed fills exactly equal to the original whole-listing price. Rounding can move one drop between successive fills, so each buyer must approve their exact quantity and price rather than an approximate displayed unit price.

Example: 10 shares listed for 7 drops can settle as 3 shares for 2 drops, another 3 for 2 drops, and the remaining 4 for 3 drops. The total remains 7 drops.

## Persistence and concurrency

`src/partial-fills.ts` defines immutable order terms, cumulative filled quantity, received price, one pending reservation, and completed fill proofs. Every mutation returns a new revision.

`src/partial-store.ts` stores these records in SQLite with WAL, full synchronous writes, and revision compare-and-swap inside `BEGIN IMMEDIATE`. A competing reservation based on an old revision fails. Attempt IDs and transaction hashes have durable uniqueness constraints across orders; completed claims remain recorded after a fill. Restarting the process preserves the exact pending hash and does not authorize another submission.

The store validates immutable terms, legal transitions, exact accounting history, and proof context. It accepts trusted server operations; it does not authenticate wallets or independently verify the ledger. The existing authenticated API boundary must remain in front of any future integration.

Cancellation or expiry stops new reservations. Neither action revokes an existing signed authorization. A pending fill remains reserved and may still settle after cancellation or expiry. Unknown outcomes stay pending. There is no automatic release, rebuild of signed terms, or resubmission.

## Integration with the chosen primitive

The proposed execution sequence preserves the existing all-or-nothing Batch exchange:

1. Read a fresh validated seller position. Atomically reserve the requested quantity and its exact quote using the order revision.
2. Preserve the preflight snapshot. `buildPartialChildOffer` produces immutable child terms containing only the reserved shares and allocated XRP price.
3. Pass those terms to the existing `buildSaleBatch`. Collect the buyer and seller signatures separately using the current authenticated signing flow.
4. Persist the signed transaction, exact hash, ledger bound, and submission claim before broadcasting once. `bindPartialTransaction` and the prototype store demonstrate the immutable hash claim; the existing execution coordinator supplies the durable signed-blob and submission lifecycle.
5. Call `verifyBatchSettlement` for that exact child offer and transaction. Both internal transactions must validate in the same ledger, identify the outer Batch via `ParentBatchID`, and deliver the exact reserved quantities.
6. Pass the normalized proof through the trusted verifier adapter to `reconcilePartialFill`. Compare-and-swap the new filled quantity and remaining price. If cancellation or expiry won a concurrent revision, reread the state and reconcile the same proof without reopening the order.

The child offer is a verification and signing context, not another borrower loan or another vault. A production integration must persist the child preflight and signed-attempt data with its reservation before accepting signatures. This prototype does not add those routes or browser controls.

## Evidence and reproducible checks

Run from the repository root on Node 24:

```sh
npm test -- tests/partial-fills.test.ts tests/partial-store.test.ts tests/market-proof.test.ts
npm run typecheck
```

The tests cover exact large-number arithmetic, rounding, overfill rejection, duplicate IDs and hashes, one pending reservation, cancellation, expiry, mismatched proof fields, input mutation during asynchronous verification, competing SQLite connections, persisted restart state, stale completion versus cancellation, and replay after settlement.

The persistence integration test builds child terms for 3 of 10 shares, signs a real SDK Batch locally with independent synthetic wallets, and runs the actual `verifyBatchSettlement` implementation against deterministic validated-transaction fixtures, including API v2 `DeliverMax` presentation. It then commits one fill and confirms that restart and replay cannot increment the fill twice. These are local tests, not a claim that multiple partial purchases have been executed live.

The underlying Batch mechanism has separate live whole-listing evidence: [validated exchange at ledger 69551](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/D243D7793EE8579A550C8FEB24C39D38B88132A6C295CD5BA40CD0F7A9F0AE07). That transaction supports the settlement primitive; it is not evidence of this partial-order coordinator being deployed.

## Remaining product integration

Before exposing partial purchases, connect a versioned partial-order repository and child-attempt persistence to the current authenticated service, add quantity selection and exact rounding disclosure, and run a real sequence of multiple partial fills followed by cancellation or final redemption. Keep cross-process revision checks and the existing no-resubmission behavior. Exploration is implemented and tested; browser-accessible partial trading remains outside the current application.
