# Vault-Share Transfer and New-Holder Rights (Issue #12)

## Result

This evidence proves transfer of **vault shares** only. It does not transfer an underlying borrower `Loan` object. A new share holder successfully redeemed the received shares when liquidity was available; a former holder who had transferred the entire bounded holding could not redeem those shares.

- Environment: Track 1 custom Devnet, network ID `4001`
- SDK: `xrpl.js` `5.2.0`, pinned in `scripts/share-transfer/package.json`
- Vault: `84953AA75CEBE50930F987E969D7918308B7C1471253DB0BD5E55CF3334C66DF`
- ShareMPTID: `000000016D8E5748CD5FA882BDFF41D6619F430CF479D096`

## Live MPT definition and receiver opt-in

The verifier reads the current `MPTokenIssuance` ledger entry directly. Its immutable transfer-related flags are `56`: `CanTrade` (`16`) and `CanTransfer` (`32`) are set; `RequireIssuerAuth` (`4`) is not set. The issuance’s `Issuer` is the vault pseudo-account, and its ID matches the vault’s live `ShareMPTID`.

Receiver-side holder opt-in was nevertheless required in this exact Track 1 flow. A seller attempted to deliver 100,000 units to a newly funded buyer with no MPT holding and received [`tecNO_AUTH`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/EC138DB092331B8BE2613213A6E4DDD1EBFBAD3088130EA47428026C92026A27) in ledger `66983`; neither share holding changed and the seller paid 12 drops. The buyer then submitted [`MPTokenAuthorize`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/AC3B4A829C5455CAE5EC69EE91E0E12B5257F0388F135B9D658F5326AA812044), `tesSUCCESS`, ledger `66985`, fee 12 drops. Thus `RequireIssuerAuth=false` does not remove the observed receiver holding/opt-in requirement.

## Bounded full transfer

The disposable seller first created a share holding through [`MPTokenAuthorize`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/41D60AEDC31954763739453AD37BFC3C477DF0EAA8BCDB1F9861132E5755A7B5), ledger `66980`, `tesSUCCESS`, fee 12 drops. The existing lender then allocated exactly 100,000 units with [`Payment`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/57A197B6FEBB91CF8AA477B03E76A41BB19ECB66702B7A4AF3B694C3E4EE9F0A), ledger `66981`, `tesSUCCESS`, fee 12 drops. The seller then transferred the entire amount to the opted-in buyer using [`Payment`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/84C763C94911014BA93C3A80E2C3991463A2294B3CB56CA73CC91CDC60282350), validated in ledger `66987` with `tesSUCCESS` and a 12-drop fee.

| Holding | Before | After |
| --- | ---: | ---: |
| Seller vault shares | 100,000 | 0 (`MPTAmount` absent; zero-unit MPToken entry retained) |
| Buyer vault shares | 0 | 100,000 |

The successful delivery is bounded to 100,000 MPT units. It changes vault-share ownership; it does not assign a particular borrower loan to the buyer.

## Former-holder rejection

After the seller’s balance became zero, the seller attempted [`VaultWithdraw`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/197FA71655629C18351C7543DEF958E838B890E9BEC534F841D5C24C5F00B82D) for the exact 100,000-drop amount in ledger `66989`.

- Result: `tecINSUFFICIENT_FUNDS`
- Fee charged: 12 drops
- Seller share balance: 0
- Vault liquidity: unchanged at 9,000,000 drops
- The transaction metadata changed neither a share holding nor the Vault entry.

The same amount was successfully withdrawn by the buyer two ledgers later while the vault still had 9,000,000 drops available. This isolates the rejection to the former holder’s lack of shares, rather than vault liquidity.

## New-holder redemption

The new buyer redeemed exactly the transferred 100,000 units with [`VaultWithdraw`](https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/A36C0044D4CF5F5A346C1EFF5F7134E10D0E148A8B08DE3BE51BDCE9F00F5599), validated in ledger `66991`, `tesSUCCESS`, fee 12 drops.

| Observed field | Before | After |
| --- | ---: | ---: |
| Buyer vault shares | 100,000 | 0 (holding deleted) |
| Buyer XRP | 999,999,988 | 1,000,099,976 |
| Vault `AssetsAvailable` / `AssetsTotal` | 9,000,000 | 8,900,000 |

The buyer’s XRP increase was 99,988 drops: 100,000 redeemed minus the 12-drop transaction fee. The share issuance outstanding amount also decreased from 9,000,000 to 8,900,000.

The prior Issue #5 transfer and Bob redemption remain independent, earlier confirmation of the same new-holder redemption path; this Issue #12 test specifically adds the former-holder ownership-loss proof.

## Revalidate

The verifier signs nothing and reads no wallet files. It fetches the public transaction hashes, reads the live MPT issuance and vault entries, verifies expected results/ledger indexes, and derives balance changes from validated metadata.

```sh
cd scripts/share-transfer
npm install
npm run verify
```

## Acceptance checklist

- [x] Live immutable transfer settings read from the issuance entry.
- [x] Receiver holder-opt-in requirement demonstrated and documented.
- [x] Bounded transfer and both validated share balances proven.
- [x] New holder successfully withdrew transferred shares, with XRP, fee, and vault-liquidity evidence.
- [x] Former holder’s post-transfer redemption failed `tecINSUFFICIENT_FUNDS` while liquidity remained sufficient.
