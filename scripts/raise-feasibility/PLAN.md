# Raise secondary-market feasibility spike

> Historical feasibility record. This preserves the original plan/results and SDK context. The selected Batch mechanism is now integrated in the application; see [current integration and evidence](../../docs/INTEGRATION.md).

## Scope and guardrails

- Track 1 only: the custom Hackathon Devnet at the supplied RPC and WSS endpoints.
- No product UI, application refactor, or mainnet/testnet assumptions.
- All ledger writes use disposable funded accounts and are isolated in this folder.
- A failed preflight is evidence, not something to work around by assuming a feature exists.

## Baseline findings (2026-09-12)

- The repository contains only `README.md`; there is no existing vault/lending helper to reuse.
- No project `package.json`, installed `xrpl`, or resolvable `xrpl.js` version exists.
- An HTTPS JSON-RPC `server_info` request to `https://lending-hackathon.dev.ripplex.io:51234` timed out after 15 seconds, including a retry outside the sandbox. WSS has not yet been tested.

## Phase 0 — unblock and fingerprint the network

1. Retry RPC and WSS connectivity with bounded timeouts; save only non-sensitive diagnostics.
2. Query `server_info`, `server_definitions`, and the validated ledger. Record server build, network ID, enabled amendments, and transaction/ledger-entry definitions.
3. Stop if the supplied endpoints remain unavailable. Report that neither kill question can be tested on this network.

## Phase 1 — establish a reproducible client

1. Inspect the discovered server definitions and the compatible `xrpl.js` release documentation before choosing a version; pin that version locally rather than using an unverified latest release.
2. Add a minimal spike-only Node setup under this folder and a small connection helper. Do not change app runtime code.
3. Confirm client connection, network ID, and transaction autofill/sign/submit behavior with a harmless read-only request before any write.

## Phase 2 — vault-share transfer and withdrawal-rights test

1. Discover the network's actual XLS-65 vault transaction types, required fields, and vault/share ledger objects from `server_definitions`; do not substitute guessed transaction names or fields.
2. Create or locate a controlled open-ended vault using disposable Alice/Bob accounts. Record the vault ID, underlying asset, share MPT issuance ID, and initial balances.
3. Have Alice deposit into the vault, then verify her MPT holding and the vault's share-accounting state through validated ledger queries.
4. Execute the network-supported transfer path from Alice to Bob (including any required MPT authorization, trust/holding setup, or payment semantics discovered in Phase 2.1).
5. Verify on the validated ledger that Alice's share balance decreased and Bob has a genuine MPT holding—not merely an offer, authorization, or pending object.
6. Have Bob invoke the documented withdrawal/redeem path for those shares. Verify the withdrawal succeeds and Bob receives the expected underlying asset amount, subject to documented vault fees/rounding/lockup rules.
7. Repeat with an intentionally invalid or unauthorized recipient setup to confirm the relevant guardrail and result code.

**Kill-question 1 pass criterion:** Bob's validated MPT holding can be redeemed by Bob through the vault's normal withdrawal path. A balance-only transfer without successful redemption is a fail/inconclusive result.

## Phase 3 — atomic payment-for-share settlement test

1. From the live server definitions/amendments, identify every supported candidate for an atomic two-party exchange (for example, a protocol-native batch/composite transaction or an order-book mechanism that supports the exact MPT and payment assets). Do not infer support from public XRPL documentation.
2. For each candidate, map the exact preconditions: signatures/authorizations, reserve requirements, MPT transfer constraints, and whether both legs are validated in one atomic ledger outcome.
3. Run a success case: Bob's payment and Alice's share delivery; verify both final balances and transaction metadata.
4. Run failure injections for each leg (insufficient Bob funds; Alice cannot transfer the share; invalid MPT authorization). Verify the other leg is unchanged after validation.
5. Reject multi-transaction sequencing, off-ledger promises, or compensation logic as answers to this kill question: they are not all-or-nothing on-ledger settlement.

**Kill-question 2 pass criterion:** one network-supported settlement primitive produces both transfers on success and neither transfer on forced failure, proven from validated ledger state and metadata. If no such primitive supports the share MPT/payment pair, the result is **not feasible on this network**, even if a UI or escrow workflow could approximate it.

## Deliverables after implementation

- Read-only network capability report and pinned `xrpl.js` version.
- Reproducible scripts, redacted transaction hashes, and before/after ledger evidence.
- A concise pass/fail/inconclusive verdict for each kill question, with exact blocker/result codes where applicable.
