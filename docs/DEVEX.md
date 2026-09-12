# DevEx capture and team evidence process

## Two complementary feedback channels

Automated DevEx capture records XRPL-related development friction from each participant's own coding session, subject to that participant's consent. It is useful for time, retry, tool-output, and session-level signals.

The manual team feedback report is separate. It selects the strongest reproducible findings, adds context and impact, and is the only channel used for the team's final curated DevEx submission. Automated capture does not replace a teammate recording a useful finding immediately.

## Individual setup rule

Every teammate configures DevEx independently in their own local checkout and consents independently. Never share or commit an identity file, invitation code, wallet seed, credential, token, or local hook configuration.

## What “verified” means

These states are deliberately distinct:

| State | Meaning | How to verify |
| --- | --- | --- |
| Installed | Project-local hooks and skills were registered. | Run the event setup/status command and inspect the project-local hook configuration. |
| Local capture/buffer verified | An XRPL-related event is present in the local DevEx buffer or local sent record. | Run the status command and inspect the local `.xrpl-devex/` records; do not commit them. |
| Remote delivery confirmed | The participant has direct evidence that the organizer accepted a delivery. | Record only an explicit, observable confirmation from the event tooling or organizer. |

Local capture is not proof of remote ingestion. When delivery cannot be directly observed, state exactly: **“Local capture verified; remote delivery status not independently observable.”**

## Team status and final submission

Issue #3 is closed and the previous team record reported four completed local setups. This repository does not contain private per-participant capture records and cannot independently reverify that each hook is active now. Each teammate should run their own status check before submission. Do not convert that historical setup record into a claim of current remote delivery.

The curated manual report is [DEVEX_FEEDBACK.md](../DEVEX_FEEDBACK.md), with detailed reproductions under [devfeedback/findings](../devfeedback/findings/). Report preparation (#26) and final submission/sign-off (#28) are distinct. The running web deployment does not install or transmit another participant's DevEx hook.

## Public evidence and security handling

Use `devfeedback/TEMPLATE.md` for every manual finding and `devfeedback/findings/` only for sanitized, reproducible public findings. Include public transaction hashes, explorer links, code paths, and redacted logs when useful.

Security findings, suspected vulnerabilities, private protocol/security details, and exploit steps must be reported privately to Ripple mentors. They must not be placed in this public repository, the automated feedback text, or the final public team report.

Before the final manual DevEx report, review all candidate findings, remove secrets and unnecessary account details, and select the highest-impact reproducible items.
