# Wallet integration and signing surface (Issue #18)

## Decision

No external browser wallet was verified to support the Track 1 custom Devnet
(network ID `4001`), its private RPC/WSS endpoints, XLS-65/XLS-66 transaction
types, MPT payments, and multi-account Batch signing together. The selected
integration is therefore an explicitly labelled **Track 1 hackathon/test-wallet
mode** using `xrpl.js` `5.2.0-beta.1`/`Wallet` client-side. It is not a
production wallet architecture and is not custodial: there is no server-side
signer or seed API.

The wallet boundary is implemented in `src/wallet.ts`. It exposes only account,
connection and network status to UI code, checks the connected wallet and the prepared transaction both use network ID `4001` before every
signature, rejects unsupported transaction types, and never submits or sends
seeds/private keys to a server. There is not yet a browser frontend in this
repository, so actual on-screen display is **pending frontend integration**;
`publicWalletStatus` is the safe data source the UI must render. A real application should replace this mode
with an audited external connector once one supports the custom network.

## Required signing surface

The current demo may require: XRP `Payment`; vault-share MPT `Payment`;
`MPTokenAuthorize` (receiver opt-in); `VaultCreate`; `VaultDeposit`; `VaultWithdraw`;
`LoanBrokerSet`; `LoanBrokerCoverDeposit`; `LoanSet` (broker and borrower
signatures); `LoanPay`; and `Batch` with `tfAllOrNothing`. Batch signing follows
Issue #13 evidence exactly: the buyer authorizes the XRP inner payment, while
the seller authorizes the share-delivery side and outer Batch. The buyer must
opt in with `MPTokenAuthorize` before receiving shares. The full list and roles
are exported as `REQUIRED_SIGNING_SURFACE`.

## Network and UX safety

The UI must visibly show “Track 1 custom Devnet”, network ID `4001`, and the
connected classic address. `assertWalletReady` blocks signing when disconnected,
when the network ID is anything other than `4001` (including Mainnet, public
Testnet or public Devnet), or when the account fails XRPL classic-address checksum validation. Reconnect is a
recoverable state. `signTrack1` classifies user rejection separately from other
signing failures; rejection explicitly means no submission occurred.

Unsupported transaction types are rejected before invoking the connector. Callers must autofill on the selected network before calling `signTrack1`; an absent or mismatched transaction `NetworkID` is rejected before signing. Submission remains a separate, validated-result step.

## Real signed evidence

The newly implemented `src/wallet.ts` path has now been live-tested with one
low-risk disposable-account transaction. The opt-in test account
`rD3m…JpEg` signed `MPTokenAuthorize` for the existing share issuance; the
transaction [`50EE8015…82E7`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/50EE801562E331D70805E8528176B38DA74867315D0274346544203E1AFC82E7)
validated on ledger `67737` with `tesSUCCESS` and a 12-drop fee. The seed was
held only in the test process and was not written or logged. Earlier Bob
evidence ([`D114AB7B…`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/D114AB7BAB7A9F4997707E73024F591442C0FB27385AFCE497DA1DC707CBB48F),
ledger `65182`) remains historical evidence. The historical Batch sale and multi-account signatures in `docs/SETTLEMENT.md` and `docs/SALE.md` used direct xrpl.js `Wallet.sign` and `signMultiBatch` calls. They prove the SDK mechanism, not Batch execution through the new `src/wallet.ts` boundary. Only the `MPTokenAuthorize` path above has live evidence through this boundary; browser and multi-party workflow integration remain to be verified.

## Reproduction and limitations

```sh
npm run check
npm run wallet:live-test # opt-in: creates one disposable account/MPTokenAuthorize
```

Tests cover matching/wrong network, displayed account state, disconnects,
rejected signatures, unsupported transaction types, and the absence of secret
fields in the public status object. This mode is for disposable Track 1
accounts only; never place a seed in source, logs, analytics, browser storage,
or an application API. Production should use a connector with explicit
custom-network and multi-party-signature support, or disable the corresponding
flow rather than silently falling back to an ordinary XRP Payment wallet.

## Acceptance status

- [x] Safe public account/network status and Track 1 signing guards implemented.
- [x] Live signed `MPTokenAuthorize` validated through `src/wallet.ts` (`50EE8015…82E7`, ledger `67737`).
- [ ] On-screen network/account display: pending frontend integration because this repository currently has no browser UI.
