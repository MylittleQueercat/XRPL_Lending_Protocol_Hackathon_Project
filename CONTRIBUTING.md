# Contributing to Raise

Use English for shared documentation, issues and pull requests. Everyone can propose changes; the concept is a starting point for team discussion.

1. Clone the repository, use Node 24, and run `npm ci` then `npm run check`.
2. Read the README network status before sending any ledger transaction.
3. Open an issue using **Project task or proposal**, or comment on a relevant existing issue. Add observable acceptance criteria and dependencies; do not add time estimates unless the team requests them.
4. Create a branch from current `main`, for example `feat/vault-position`, and keep its scope focused.
5. Run `npm run check`. For ledger changes, attach sanitized proof from a validated ledger; submission alone is not success.
6. Open a pull request referencing the issue. Get teammate review before merging changes that affect signing, amounts or settlement.

The initial roadmap intentionally has no assignees. Coordinate before taking a task; do not assign other teammates without agreement. Use issue comments for changes to scope, and add new proposals freely. GitHub Projects permissions are separate from repository permissions; until the repository owner enables the shared board, repository issues and milestones are the shared source of truth.

## Local credentials and evidence

Use disposable faucet-funded hackathon wallets only. Keep wallet seeds and environment files in ignored local storage; never attach them to issues or commit them. Never commit `.xrpl-devex`, invitation codes, participant identity files, local AI settings, or captures of private conversation content. Each teammate should set up the event's official DevEx hook individually, with their own consent, using the event instructions. Its automatic capture does not replace the manual report.

Publish only evidence deliberately reviewed for sharing: network, SDK version, ledger index, public transaction hash and address, result, expected/actual behavior. Potential protocol security findings must be discussed privately with a mentor before any public disclosure.

## Product guardrails

Raise trades vault shares, not individual loan contracts. NAV, cash liquidity and market price are different quantities. A discount is not guaranteed yield. A listing is not proof that a trade can still execute. Never represent two separate transfers as an atomic sale.
