# No wallet on the hackathon network can provide the second signature a LoanSet or a settlement Batch needs

## Category

Missing primitive / wallet tooling

## Severity

High

## Attempt

Integrate a wallet so that each participant authorises their own operations from the Raise web application: the borrower counter-signs a `LoanSet`, and a buyer signs the inner payment leg of a `tfAllOrNothing` `Batch` whose outer transaction the seller signs.

## Expected result

A connector through which the application can request a signature from the counterparty's own wallet, on the Track 1 network, for these two transaction shapes.

## Actual result

None exists. `xrpl-connect` (Xaman, Crossmark, GemWallet, WalletConnect adapters) targets the public networks and single-signer transactions; it cannot be pointed at a custom devnet with network ID 4001, and none of the wallets it wraps exposes `signLoanSetByCounterparty` or `signMultiBatch`. Both signatures must be applied to the **same autofilled transaction object**, so the two keys have to be present in one signing context at the same moment.

## Reproduction steps

1. Attempt to configure any mainstream XRPL wallet or `xrpl-connect` for `wss://lending-hackathon.dev.ripplex.io:51233`, network ID 4001.
2. Attempt to request a counterparty signature on a `LoanSet`, or an inner-leg signature on a `Batch`, from that wallet.
3. Observe there is no API for either.

## Environment and exact versions

- `xrpl.js` 5.2.0-beta.1, `xrpl-connect` 0.8.2, `rippled` 3.4.0-rc1, network ID 4001.

## Transaction / explorer / code / logs

Working alternative used by the app: a local development wallet (`web/src/lib/wallet.tsx`) that holds a faucet seed in `sessionStorage`, signs in the browser with `xrpl.js`, and refuses every signature unless the connected node reports network 4001 at the moment of signing. Verified with a real validated payment through the same code path: [`evidence/web-wallet-signing.json`](../../evidence/web-wallet-signing.json).

For the two-party transactions, the demo screens ask for the counterparty's test seed in a clearly labelled field, used once in the browser and never stored. That is acceptable for a demonstration and unacceptable for a product.

## Impact

The two transactions that define this protocol's value — a loan both parties agree to, and a sale where payment and delivery are inseparable — cannot be signed by two independent wallets today. Any team building a real user journey either ships a custodial workaround or asks users to paste seeds. Both undermine the product story the protocol enables.

## Proposed improvement

A wallet-side signing request for "sign as counterparty on this LoanSet" and "sign this inner Batch transaction", plus custom-network support in `xrpl-connect`. Short of that, documentation of the recommended coordination pattern (who prepares, who signs first, how the partially signed blob travels) would let teams build a relay correctly.

## Resolution / workaround

Local development wallet in the browser for the connected party; counterparty test seed entered once for the demo; every figure re-read from the validated ledger after signing.

## Public or private-security

Public.
