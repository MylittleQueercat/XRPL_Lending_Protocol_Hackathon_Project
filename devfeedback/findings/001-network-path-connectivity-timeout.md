# Initial Track 1 network-path timeout lacked a useful diagnosis

## Category

Infrastructure / error-message

## Severity

Medium

## Attempt

Run the Track 1 HTTPS JSON-RPC `server_info` preflight from the initial development network path.

## Expected result

Either a JSON-RPC response or a network error that identifies whether DNS, TCP, TLS, or the endpoint is unavailable.

## Actual result

The initial preflight timed out after 15 seconds. Later validated Track 1 work succeeded, so this evidence supports a network-path diagnosis rather than a protocol capability conclusion.

## Reproduction steps

1. Run a bounded HTTPS `server_info` request against the supplied Track 1 endpoint.
2. Record the timeout and retry from a known-good network path before concluding the Devnet or an amendment is unavailable.

## Environment and exact versions

- Initial spike baseline: 2026-09-12.
- Later successful Track 1 run: `xrpl.js` 5.2.0; xrpld `3.4.0-rc1`; network ID `4001`.

## Transaction / explorer / code / logs

- Baseline timeout: `scripts/raise-feasibility/PLAN.md`.
- Later successful validated ledger evidence: `scripts/raise-feasibility/RESULTS.md`.

## Impact

A generic timeout can lead developers to incorrectly attribute an access-path problem to missing protocol functionality.

## Proposed improvement

Publish a small health endpoint and return explicit TLS or service-unavailable errors where possible. Document a bounded connectivity preflight for hackathon participants.

## Resolution / workaround

Retry from a known-good network path and distinguish endpoint reachability from amendment activation with live `feature` and ledger queries.

## Additional isolation evidence

A second teammate hit the same timeout independently and isolated the cause with controls rather than inference. Every endpoint on the non-standard ports failed while every endpoint on port 443 worked, across three unrelated networks and a neutral port-test host:

| Target | Port | Result |
|---|---|---|
| `lending-hackathon-faucet.dev.ripplex.io` | 443 | reachable |
| `custom.xrpl.org` explorer | 443 | HTTP 200 |
| `xrplcluster.com` (mainnet) | 443 | HTTP 200, `build_version` 3.3.0 |
| `xrplcluster.com` (mainnet) | 51234 | timeout |
| `lending-hackathon.dev.ripplex.io` | 51233 / 51234 | timeout |
| `s.devnet.rippletest.net` (public devnet) | 51234 | timeout |
| `portquiz.net` (neutral control) | 8080 | timeout |

Mainnet failing on 51234 while succeeding on 443 rules out any XRPL service as the cause: the access path filtered outbound non-standard ports. TCP connects appeared to succeed and then no data arrived, which is why the failure reads as a node outage rather than a filtered port.

The practical diagnostic is one line: **if the faucet works but RPC and WSS time out, test `xrplcluster.com` on 443 and on 51234 before reporting a devnet outage.** Publishing a port-443 endpoint for hackathon devnets would remove the failure mode entirely.


## Public or private-security

Public
