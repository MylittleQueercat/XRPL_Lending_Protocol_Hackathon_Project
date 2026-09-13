# Raise — hackathon submission audit

Reviewed September 13, 2026 against the [event Notion](https://app.notion.com/p/adam-hn/XRPL-Lending-Protocol-Hackathon-5cc7508f4cdc83a7991e01f90528e490). This matrix separates implemented and recorded work from requirements that need external confirmation. A prepared file is not a submitted deliverable.

## Track, environment and scoring

Raise's declared entry is **Track 1 / Loaded**. It uses an open-ended vault on the dedicated network 4001. XLS-65 and XLS-66 provide the independently runnable Vanilla lending baseline; Batch (XLS-56) adds atomic XRP payment against vault-share delivery. It is not a Track 2 closed-ended subscription/investment/redemption product.

The event weights developer feedback 40%, XRPL execution 30%, creativity/use case 20%, and presentation/demo 10%. The required live presentation is four minutes plus two minutes of questions, with at most ten slides. A separate video is not listed as mandatory in the reviewed page.

**Environment discrepancy to disclose:** the event's SDK table still names stable/beta.0 depending on track, while the team received an explicit update to `xrpl@5.2.0-beta.1`. Both application lockfiles pin beta.1. The event ledger also enabled `LendingProtocolV1_1` while accepting the open-ended flow. Keep the actual version and measured amendments in the submission, and confirm the mapping with the organizers; do not change networks or SDKs solely to match an older table.

## Required lending behavior

“Recorded” below means a committed, dated ledger proof exists. It is not a claim that the entire flow was repeated against every subsequent frontend revision or public deployment.

| Requirement | State | Evidence / interpretation |
|---|---|---|
| Create the chosen vault type | Recorded | Open-ended `VaultCreate` in [Vanilla baseline](../evidence/vanilla-flow.json). |
| Lender deposits capital | Recorded | `VaultDeposit`, 100 XRP, matching share issuance. |
| Configure broker and borrower-accepted loan | Recorded | `LoanBrokerSet`, cover deposit and two-party `LoanSet`; [complete integration evidence](../evidence/market-e2e.json). |
| Borrower draws down funds | Recorded | Validated `LoanSet` disbursement and borrower balance delta. There is no invented separate drawdown transaction. |
| At least one repayment | Recorded | `LoanPay`; baseline records the actual charged amount separately from its offered upper bound. |
| Withdraw capital plus yield | Recorded | 100 XRP deposited → **100.000188 XRP** gross redemption; 188 drops realized yield; final share balance and supply zero. |
| Reject one protocol guardrail | Recorded | Attempted 100-XRP withdrawal with 50 XRP cash → `tecINSUFFICIENT_FUNDS`; lender shares unchanged. |
| Credible lending use case | Documented | [SME working-capital scenario](PROJECT_CONCEPT.md), with real loan workflow. No commercial borrower adoption is claimed. |
| Useful Loaded primitive | Recorded / classification disclosed | Batch provides two-party atomic payment for shares; [settlement evidence](../evidence/market-e2e.json). Private mentor approval is not recorded. |

The new [September 13 two-browser run](../evidence/browser-market-e2e-2026-09-13.json) validates the current UI with a 95-XRP share sale and **100.000602 XRP** gross buyer redemption. Final buyer shares, share supply and vault cash are zero. The buyer request survived reload; the saved Batch was reconciled without a second submission.

The separate [two-browser run](../evidence/browser-market-e2e.json) also ends in 100.00024 XRP buyer redemption. The [500-XRP UI scenario](../evidence/browser-use-case-2026-09-12/README.md) redeemed exactly 300 XRP and left 4,802 raw share units; use it to explain the trade, not as proof that all buyer shares were burned.

## Required deliverables

| Requirement | Current state | Remaining confirmation |
|---|---|---|
| Public GitHub repository | Available | [Repository](https://github.com/MylittleQueercat/XRPL_Lending_Protocol_Hackathon_Project); use the final reviewed commit in the entry. |
| README with setup, track, network, SDK and used transactions | Prepared | [README](../README.md) lists the actual application versions, endpoints, commands and transaction types. |
| Verified on-chain transaction links | Recorded | README transaction table and linked evidence include complete hashes, ledgers and outcomes. Network resets may affect explorer availability. |
| Presentation, ten slides maximum | **Existing slides reported ready by the team** | Keep the team's existing deck; its file/link and slide count have not been independently checked here. |
| Manual DevEx report, three pages maximum, at repository root | **Team-owned; final approval pending** | The team must prepare it without AI. The pre-existing [report](../DEVEX_FEEDBACK.md) is preserved; no AI-rewritten report or generated PDF is included in this release. Authorship, content and page count require team verification. |
| Three concrete frictions presented | Pitch prepared | [Four-minute pitch](DEMO.md) covers accounting guidance, grace-period validation and Batch outcome interpretation. |
| DevEx form containing team members and GitHub handles | **Not confirmed submitted** | The reviewed Notion does not expose a form link. Obtain the current form/submission route from the organizers and retain the acknowledgement. |
| DevEx hook for every developer | **Installation confirmed by the team** | Adam confirms all teammates installed it. Current per-developer capture and organizer receipt are not independently verified by this checkout. |
| Four-minute live demo and two-minute Q&A | Script and rehearsal plan prepared | [Demo playbook](DEMO.md); a completed team rehearsal and live presentation cannot be inferred from source files. |
| Full demo video requested by the team | **Pending after application validation** | [Capture and motion plan](DEMO.md); separate from the mandatory live demo. |
| Final team approval / submission | **Not confirmed** | Team confirms roster, content, final commit and actual submission acknowledgement. |

Observed repository collaborator handles: **MylittleQueercat, vgtray, DAVIDshenghuei, aminssutt**. This is a GitHub access roster, not a verified mapping to registered participant names. Confirm those mappings and any roster changes before entering the form; do not derive legal names from commit authors.

## Release verification

The updated interface uses Portfolio at `/portfolio`, share offers at `/market/[id]`, and the current Operator desk. `/position` and `/buy/[offerId]` are compatibility redirects. Earlier passing checks and dated E2E artifacts remain valid evidence of those recorded runs; the final release must record its own revision and validation scope.

| Release gate | Evidence location |
|---|---|
| Root/web checks and production build | Final PR/check output; do not substitute a previous revision's result. |
| Current buyer/seller browser journey, reload and recovery | [September 13 browser evidence](../evidence/browser-market-e2e-2026-09-13.json); deposit, guardrail, separate signatures, reload, read-only reconciliation and full redemption passed. |
| Public HTTPS, routes, assets, network connection and deployed revision | [Deployment record](DEPLOYMENT.md). |
| Full trading flow on public hosting, if claimed | Requires a separately recorded public run; localhost-only harnesses do not establish it. |

## Submission handoff

1. Open the final README, presentation and compact DevEx report from the public repository. Check links, slide/page counts and visible content.
2. Rehearse the pitch with the current two-account trading fixture and a clearly labelled recorded fallback. Keep seeds, private configuration and invitation codes out of every recording.
3. Confirm the beta.1/network interpretation, submission route and registered roster with the organizers. Complete the required team form and preserve its acknowledgement.
4. Have the team approve the final repository commit and uploaded assets. Close the submission ticket only when actual delivery and sign-off are known.

Bids/RFQs, live partial fills and a production embedding SDK are later product work, not missing components of the declared full-lot V1. Independent buyer/seller and integrator feedback remains open in #31 and #32. No claim of those external validations is made here.
