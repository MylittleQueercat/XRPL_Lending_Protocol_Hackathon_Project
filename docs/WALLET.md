# Wallet integration and signing surface (Issue #18)

## Current decision

Raise has a working browser frontend and uses an explicitly labelled **Track 1
test-wallet mode** with `xrpl@5.2.0-beta.1`. An external connector supporting the
custom network, lending transactions and multi-account Batch signing together
has not been verified by this project. Only disposable, faucet-funded accounts
on network **4001** belong in this mode. This is not a production wallet
architecture.

The browser implementation is [web/src/lib/wallet.tsx](../web/src/lib/wallet.tsx).
It exposes public account/network state, creates or imports a test wallet, and
checks the selected network and active account before returning a signer.
[ledger.ts](../web/src/lib/ledger.ts) handles single-account submission and
recovery; [market-signing.ts](../web/src/lib/market-signing.ts) checks and signs
the exact prepared marketplace Batch terms. The older
[src/wallet.ts](../src/wallet.ts) remains the connector-neutral signing contract
and historical test seam. It is not the browser provider used at runtime.

## Storage and actor separation

The browser provider keeps its test seed in memory and `sessionStorage` under
`raise.wallet.local.v1`. Reload can restore that session; disconnect clears the
active signer and attempts to remove the stored wallet. Storage is not encrypted
or a production key vault. Import can remain memory-only when session storage
is unavailable. Faucet creation requires verified storage retention before
checking funding, so an interrupted funding read can recover the same identity.
The faucet returns disposable wallet material to the browser; the Raise
marketplace API never accepts a seed or private key.

The submission journal in `localStorage` contains only public transaction
identifiers, account, type, network, expiry ledger and creation time. It contains
no seed, private key, signature or signed transaction blob. The server SQLite
store contains offers, challenges, prepared signatures and submitted transaction
blobs needed for durable settlement, but no wallet private keys.

Buyer and seller use **separate browser wallets** and independently approve the
same sale. Neither marketplace actor enters the other actor's seed. Use distinct
browser sessions or freshly created tabs; a duplicated tab can inherit session
storage. Verify that the displayed public addresses differ.

The operator console has a separate limitation: its `LoanSet` form asks for a
borrower's **test seed** to counter-sign locally in the broker's browser. That
input lives in form memory and is not persisted or sent to the Raise API. A
separate borrower approval handoff is not implemented in that console. Do not
confuse this operator fixture with the two-wallet marketplace sale.

## Signing and recovery behavior

The header and wallet panel show the connected account and network state.
`requireSigner` rejects a disconnected or changed wallet, a network other than
4001, or a validated ledger older than 30 seconds. Single-account transactions
must use the connected account; their autofilled `NetworkID` is checked again.
The current ordinary fee ceiling is 1 XRP. `VaultCreate` alone permits up to
2 XRP when both the requested and prepared types are `VaultCreate`, matching
the recorded event-network creation cost. See
[vault-create-fee-fix.json](../evidence/vault-create-fee-fix.json).

Single-account submissions require Web Locks on localhost or HTTPS and a
persisted public-hash journal entry before broadcast. An unresolved entry blocks
another operation from that account. **Check transaction** reads the saved hash
and verifies the validated transaction identity before clearing the entry.
Timeouts, missing history and expired-but-unproven transactions do not silently
clear it or trigger a retry.

Marketplace signing uses the server's immutable reservation and prepared terms.
The buyer approves the XRP side; the seller signs the outer Batch and share
side. The server persists the exact signed blob/hash before its one broadcast
attempt. **Check recorded transaction** reconciles the same hash; it never sends
a second payment. See [SETTLEMENT.md](SETTLEMENT.md) and
[INTEGRATION.md](INTEGRATION.md).

The required signing surface includes XRP and vault-share MPT `Payment`,
`MPTokenAuthorize`, `VaultCreate`, `VaultDeposit`, `VaultWithdraw`,
`LoanBrokerSet`, `LoanBrokerCoverDeposit`, `LoanSet`, `LoanPay` and atomic `Batch`.
The root contract exports `REQUIRED_SIGNING_SURFACE` and rejects unsupported
transaction types in that contract. Browser actions use their own fixed builders
and validation paths; do not assume every browser call routes through the root
`signTrack1` helper.

## Recorded evidence

The historical root boundary live test signed one `MPTokenAuthorize`:
[`50EE8015…82E7`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/50EE801562E331D70805E8528176B38DA74867315D0274346544203E1AFC82E7),
ledger `67737`, `tesSUCCESS`, fee 12 drops. That disposable seed remained in the
test process. Earlier Bob authorization
[`D114AB7B…BB48F`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/D114AB7BAB7A9F4997707E73024F591442C0FB27385AFCE497DA1DC707CBB48F)
at ledger `65182` and the feasibility Batch runs remain historical SDK evidence.

The integrated browser path now has separate evidence:
[browser-market-e2e.json](../evidence/browser-market-e2e.json) records the full
seller deposit, unavailable withdrawal, independent buyer/seller signatures,
verified sale and buyer redemption on September 12, 2026.
[browser-ui-checks.json](../evidence/browser-ui-checks.json) records observed UI
behavior and a separate pending-transaction recovery across a server restart.
These local checks do not establish external-wallet compatibility or public
hosting validation.

## Verification and remaining boundary

```sh
npm run check
npm --prefix web run check
# Explicit live root-contract test; creates a disposable account and sends a transaction:
npm run wallet:live-test
```

Offline tests cover network/account guards, signing-term mutation, fee limits,
storage failure, pending-hash recovery and account changes during preparation.
The live command is optional and is not part of ordinary offline checks. For the
full local two-party journey, follow [INTEGRATION.md](INTEGRATION.md); public
hosting checks belong to [DEPLOYMENT.md](DEPLOYMENT.md).

The browser account/network display and two-party marketplace integration are
implemented and locally evidenced. An audited external connector, production
key custody and a separate operator-console borrower approval flow remain
outside this version. Never put real wallet material in this test UI, source,
logs, analytics, issue reports or deployment configuration.
