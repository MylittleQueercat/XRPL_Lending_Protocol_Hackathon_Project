# Track 1 runs V1.1 cash-basis accounting while the track description specifies V1

## Category

Documentation / network configuration

## Severity

High

## Attempt

Run the Track 1 flow as described by the event: an open-ended Single Asset Vault under Lending Protocol V1.

## Expected result

A V1 environment. The event's own annex anticipated the risk and stated that enabling V1.1 on the same ledger *"would restrict new loans to closed-ended vaults."*

## Actual result

`LendingProtocolV1_1` is enabled on the Track 1 endpoint. The predicted consequence does **not** occur: open-ended origination succeeds. What changes instead is interest recognition, which moves from whole-life to cash basis.

## Reproduction steps

1. Call `feature` on the Track 1 RPC endpoint. `LendingProtocolV1_1` returns `enabled: true`.
2. Create an open-ended vault, deposit 800 XRP, read the `Vault` object: `AssetsTotal` is 800.000000 XRP.
3. Originate a 400 XRP loan at 100 % annualised over 12 monthly instalments. The created `Loan` reports `TotalValueOutstanding` of 644.187932 XRP, so 244.19 XRP of scheduled interest exists.
4. Read `AssetsTotal` again. It is still exactly 800.000000 XRP.

Under V1 whole-life accounting step 4 would have shown roughly 1044 XRP. It did not move by a single drop.

## Environment and exact versions

- `rippled` 3.4.0-rc1, network ID 4001.
- Measurement taken with `xrpl.js` 5.2.0; the finding is a ledger property and is unaffected by the client version.

## Transaction / explorer / code / logs

Full open-ended flow validated under the same amendment set, recorded in [`evidence/vanilla-flow.json`](../../evidence/vanilla-flow.json). Origination: `AD0280823EBD6910BC95F95E726D46C3542C645B9392AD3A058436A64598EE87`.

## Impact

Teams following the Track 1 brief will document yield on the wrong accounting model. Any share-price or position-value calculation derived from `AssetsTotal` behaves differently from the V1 documentation the brief points at — directly relevant to a secondary market that prices positions from vault accounting. We spent significant time establishing which model was live because the configuration and the brief disagreed, and we initially treated the amendment as a hard blocker on the strength of the documentation alone.

## Proposed improvement

Either disable `LendingProtocolV1_1` on the Track 1 ledger, or state in the track description that Track 1 runs V1.1 accounting with open-ended vaults and link the V1.1 accounting note instead of the V1 pages. A `server_info` field naming the active lending protocol version would remove the guesswork for every team at once.

## Resolution / workaround

None available from the client: amendment state is a ledger property. We proceeded on the network as configured and report yield on a cash basis, stating the deviation explicitly.

## Public or private-security

Public.
