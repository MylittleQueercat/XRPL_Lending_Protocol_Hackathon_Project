# Complete payment-for-shares sale (Issue #14)

> Historical standalone evidence. SDK versions and transaction results below describe the original reproduction project and are intentionally preserved. For the current beta.1 application, shared marketplace and complete browser journey, start with [INTEGRATION.md](INTEGRATION.md).

## Result

The validated sale reused from the Raise feasibility run is a complete
payment-versus-delivery exchange, not two unrelated transfers. Bob (buyer)
paid Alice (seller) exactly `1,000,000` XRP drops (1 XRP), while Alice
delivered exactly `450,000` units of the vault-share MPT, in one
`tfAllOrNothing` Batch.

- Vault: `84953AA75CEBE50930F987E969D7918308B7C1471253DB0BD5E55CF3334C66DF`
- ShareMPTID: `000000016D8E5748CD5FA882BDFF41D6619F430CF479D096`
- Batch: [`4D4686…0F9`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/4D4686EA12DAD06318E95AC8537DA3975D63A0E04204809884570F195BF8D0F9)
- Validated ledger: `65192`; engine result: `tesSUCCESS`

## Validated state and fees

All XRP values are drops and all share values are integer MPT units:

| Account | XRP before | XRP after | Shares before | Shares after |
| --- | ---: | ---: | ---: | ---: |
| Seller Alice (`rHmF…MxXag`) | 931,999,676 | 932,999,616 | 9,000,000 | 8,550,000 |
| Buyer Bob (`rKqW…Utin5`) | 1,002,999,844 | 1,001,999,844 | 0 | 450,000 |

Alice's XRP increased by `999,940` drops: the `1,000,000`-drop payment less
the exact `60`-drop outer Batch fee paid by the seller. Bob's XRP decreased by
exactly `1,000,000` drops; he paid no additional fee. Alice's share delta is
exactly `-450,000`, and Bob's is exactly `+450,000`. The 60-drop fee is derived
from the validated before/after balances (and is also recorded in the public
fixture); it supersedes earlier informal 12-drop notes for this Batch.

The buyer's XRP Payment and the seller's MPT Payment are both inner
transactions of the same Batch. The validated final ownership therefore proves
an exchange: payment and delivery were applied together under the selected
atomic primitive. The underlying borrower loan is not transferred.

## Demo fixture and verifier

Safe public evidence is stored at
[`demo/fixtures/sale.json`](../demo/fixtures/sale.json). It contains no seeds,
credentials, or signing material. The read-only verifier checks the fixture's
hash, ledger index, transaction type/result, Batch flags, exact inner payment
amounts, and the recorded state deltas when the Track 1 endpoint is reachable:

```sh
cd scripts/sale
npm install
npm run verify
```

If the custom Devnet is temporarily unreachable, the verifier exits clearly
without inventing a fresh result; the historical validated evidence remains in
`scripts/raise-feasibility/RESULTS.md` and the fixture.
