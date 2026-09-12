# Manual DevEx findings

Automated capture is individual and session-based. This folder is the team's separate, curated evidence process for the final manual DevEx report.

## Recording a finding

1. Copy `TEMPLATE.md` into `findings/` with a short, descriptive filename.
2. Record friction immediately, while the attempted action, expectation, actual behavior, and versions are still known.
3. Include reproducible evidence: exact steps, relevant public transaction hash or explorer link, public code path, and a short redacted log excerpt where useful.
4. Remove wallet seeds, invitation codes, credentials, tokens, and private account or security details before saving a public finding.
5. Mark security findings `Private-security` and send them privately to Ripple mentors. Do not commit their details or proof-of-concept steps.

## Final team report

The curated report lives at [`DEVEX_FEEDBACK.md`](../DEVEX_FEEDBACK.md) in the repository root, as the event requires. It selects from this folder and links each entry back to its full finding, so the pool stays the working record and the report stays readable within the three-page limit.

At report time, review all public findings and select the strongest ones: reproducible, clearly impactful, and specific enough to suggest an improvement. The manual report should summarize those selected findings; it is not a dump of automated capture events or raw logs.

Use the capture-status language in `docs/DEVEX.md`: local buffering and remote delivery are separate claims. Do not claim remote delivery unless it is directly observable.
