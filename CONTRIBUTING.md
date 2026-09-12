# Contributing to Raise

Use English for shared documentation, issues and pull requests. Everyone can propose changes; the concept is a starting point for team discussion.

1. Pull current `main`, use Node 24 (>=24.11.1, <25), and install both lockfiles: `npm ci` and `npm ci --prefix web`. Run `npm run check` and `npm --prefix web run check`.
2. Read the README network status before sending any ledger transaction.
3. Open an issue using **Project task or proposal**, or comment on a relevant existing issue. Add observable acceptance criteria and dependencies; do not add time estimates unless the team requests them.
4. Create a branch from current `main`, for example `feat/vault-position`, and keep its scope focused.
5. Run the checks relevant to the change. Root and web checks are separate; web integration changes also require `npm --prefix web run build` and browser verification. For ledger changes, attach sanitized proof from a validated ledger; submission alone is not success. The API/browser fixture harnesses are localhost-only; do not relabel their evidence as a public-domain E2E.
6. Open a pull request referencing the issue. When implementation and checks are complete, mark the issue Done and make the PR ready for review; Done and merged are separate states. Get teammate review before merging changes that affect signing, amounts or settlement.

Tasks are not assigned automatically. Coordinate before taking a task; do not assign other teammates without agreement. Use issue comments for changes to scope, and add new proposals freely. The [shared Project](https://github.com/users/MylittleQueercat/projects/1) is linked to the repository. Its Status field tracks workflow; milestones track the six phases. GitHub Projects permissions are separate from repository permissions, so new teammates need access to both. Current collaborators can add and organize tasks. The task template adds the `roadmap` label; the enabled workflow automatically adds matching open issues to the board. Marking a card Done closes the issue through the existing Auto-close workflow. Keep readiness labels aligned manually when changing Status.

## Local credentials and evidence

Use disposable faucet-funded hackathon wallets only. Keep wallet seeds and environment files in ignored local storage; never attach them to issues or commit them. Never commit `.xrpl-devex`, invitation codes, participant identity files, local AI settings, or captures of private conversation content. Each teammate should set up the event's official DevEx hook individually, with their own consent, using the event instructions. Its automatic capture does not replace the manual report.

Publish only evidence deliberately reviewed for sharing: network, SDK version, ledger index, public transaction hash and address, result, expected/actual behavior. Potential protocol security findings must be discussed privately with a mentor before any public disclosure.

## Product guardrails

Raise trades vault shares, not individual loan contracts. NAV, cash liquidity and market price are different quantities. A discount is not guaranteed yield. A listing is not proof that a trade can still execute. Never represent two separate transfers as an atomic sale.

## Integrating parallel work

Before merging, fetch current main, integrate its changes into the PR branch and check the combined result. Preserve each teammate's commands, evidence and interfaces when resolving conflicts. Merge dependent PRs in order and retarget a stacked PR to main after its prerequisite merges. Verify CI against the current head commit, then check the merged main. Teammates should pull main or merge origin/main into their own branches before continuing; do not reset or overwrite another person's work.

## Documentation and hosted releases

The README describes the current product, setup and evidence. Technical guides describe the code that exists; mark old standalone verifiers and their SDK pins as historical instead of rewriting recorded results. Keep local offline tests, API/ledger E2E, browser E2E and public deployment checks distinct. A closed implementation issue does not prove customer demand, external wallet support or submission sign-off.

For Sunny, follow [DEPLOYMENT.md](docs/DEPLOYMENT.md). Dokploy Domains owns public routing; keep its hostname consistent with `RAISE_DOMAIN` and do not duplicate its Traefik labels in Compose. Auto-deploy is disabled. Preserve the database volume and a known-good image; public tests, backup and rollback evidence accompany a release. A documentation-only merge does not require rebuilding the running application.
