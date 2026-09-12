# Raise secondary-market feasibility spike — RESULTS

## Environment

- SDK: xrpl.js 5.2.0 (pinned in `package.json`)
- RPC: https://lending-hackathon.dev.ripplex.io:51234
- WSS: wss://lending-hackathon.dev.ripplex.io:51233
- Explorer: https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/
- Network: `{"network_id":4001,"build_version":"3.4.0-rc1","server_state":"full","validated_ledger":{"age":0,"base_fee_xrp":0.00001,"hash":"DF471720DC910F745644B80413CC881557E4FA97C8D296CA891B784EF952DF1A","reserve_base_xrp":10,"reserve_inc_xrp":2,"seq":65178},"recognized_transactions":[["VaultCreate",65],["VaultDeposit",68],["VaultWithdraw",69],["Batch",71],["Payment",0]]}`

## Disposable accounts

- vaultOwner: `rNBD9Fr2DirsjToHkpQcicpqx4wf9hz3uB` — 986 XRP (existing)
- alice: `rHmFRk6rLPAbWzDXaH1nUvxbhHgQiMxXag` — 941.9997 XRP (existing)
- bob: `rKqW5QpW4LfGfRzDAjEv2cpAkDnS2Utin5` — 1001.99988 XRP (existing)
- borrower: `rGhQPnVbkSHT9BXCjPZcmv3V3jaxY4sM7j` — 1000 XRP (existing)

Seeds are stored only in ignored `wallets.json` and are never included here.

## Feature activation (live `feature` RPC)

- SingleAssetVault: enabled (live feature RPC; server definitions alone were not treated as proof)
- LendingProtocol: enabled (live feature RPC; server definitions alone were not treated as proof)
- MPTokensV1: enabled (live feature RPC; server definitions alone were not treated as proof)
- BatchV1_1: enabled (live feature RPC; server definitions alone were not treated as proof)
- LendingProtocolV1_1: enabled (live feature RPC; server definitions alone were not treated as proof)
- Vault share MPT flags: 56 (RequireIssuerAuth=false, CanTrade=true, CanTransfer=true)

## Ledger operations

### Create open-ended transferable XRP vault
- Transaction type: `VaultCreate`
- Validated engine result: `tesSUCCESS`
- Transaction hash: `903AD65787F0537FD300B4641BB7FF43AA29C9DD5099CC331F3F99C78B76C186`
- Explorer: https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/903AD65787F0537FD300B4641BB7FF43AA29C9DD5099CC331F3F99C78B76C186
- Validated ledger: `65180`
- Before: `{"account_xrp":986}`
- After: `{"account_xrp":984}`

### Bob creates/authorizes vault-share MPT holding
- Transaction type: `MPTokenAuthorize`
- Validated engine result: `tesSUCCESS`
- Transaction hash: `D114AB7BAB7A9F4997707E73024F591442C0FB27385AFCE497DA1DC707CBB48F`
- Explorer: https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/D114AB7BAB7A9F4997707E73024F591442C0FB27385AFCE497DA1DC707CBB48F
- Validated ledger: `65182`
- Before: `{"account_xrp":1001.99988}`
- After: `{"account_xrp":1001.999868}`

### Alice deposits XRP into vault
- Transaction type: `VaultDeposit`
- Validated engine result: `tesSUCCESS`
- Transaction hash: `95E6D36442EBB9D36550C1D54DB88871B6BD7AE5443C71E4348436AE3D59655D`
- Explorer: https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/95E6D36442EBB9D36550C1D54DB88871B6BD7AE5443C71E4348436AE3D59655D
- Validated ledger: `65184`
- Before: `{"xrp":941.9997,"shares":null}`
- After: `{"xrp":931.999688,"shares":{"amount":"10000000","ledger_index":"FF502FDAE9F0AFD8076590A5D161BD4B93DF40F62382020C25640D09764795A3"},"vault":{"Account":"rwzHwAnge8aHZLyRiiuvLS6CzkozdAD3Lo","Asset":{"currency":"XRP"},"AssetsAvailable":"10000000","AssetsTotal":"10000000","Flags":0,"LEVersion":1,"LedgerEntryType":"Vault","Owner":"rNBD9Fr2DirsjToHkpQcicpqx4wf9hz3uB","OwnerNode":"0","PreviousTxnID":"95E6D36442EBB9D36550C1D54DB88871B6BD7AE5443C71E4348436AE3D59655D","PreviousTxnLgrSeq":65184,"Sequence":64954,"ShareMPTID":"000000016D8E5748CD5FA882BDFF41D6619F430CF479D096","WithdrawalPolicy":1,"index":"84953AA75CEBE50930F987E969D7918308B7C1471253DB0BD5E55CF3334C66DF"}}`

### Alice transfers vault shares to Bob
- Transaction type: `Payment`
- Validated engine result: `tesSUCCESS`
- Transaction hash: `221B4E9EEECAC4AA5AF7FDEA1F97F41614899C24BECDA6B43712ED463D3AC8FD`
- Explorer: https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/221B4E9EEECAC4AA5AF7FDEA1F97F41614899C24BECDA6B43712ED463D3AC8FD
- Validated ledger: `65186`
- Before: `{"alice_shares":{"amount":"10000000","ledger_index":"FF502FDAE9F0AFD8076590A5D161BD4B93DF40F62382020C25640D09764795A3"},"bob_shares":{"ledger_index":"F223527BD5E6F3E7BB81405ED5764081AF4E64EEA17512B3DA1A997FE0E2DF15"}}`
- After: `{"alice_shares":{"amount":"9000000","ledger_index":"FF502FDAE9F0AFD8076590A5D161BD4B93DF40F62382020C25640D09764795A3"},"bob_shares":{"amount":"1000000","ledger_index":"F223527BD5E6F3E7BB81405ED5764081AF4E64EEA17512B3DA1A997FE0E2DF15"}}`

### Bob withdraws underlying XRP using received shares
- Transaction type: `VaultWithdraw`
- Validated engine result: `tesSUCCESS`
- Transaction hash: `4A35CB34B997E6A6B1E79299960AA40E790E5CA1F320E2DE2228A52AEE6C0AB8`
- Explorer: https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/4A35CB34B997E6A6B1E79299960AA40E790E5CA1F320E2DE2228A52AEE6C0AB8
- Validated ledger: `65188`
- Before: `{"xrp":1001.999868,"shares":{"amount":"1000000","ledger_index":"F223527BD5E6F3E7BB81405ED5764081AF4E64EEA17512B3DA1A997FE0E2DF15"},"vault":{"Account":"rwzHwAnge8aHZLyRiiuvLS6CzkozdAD3Lo","Asset":{"currency":"XRP"},"AssetsAvailable":"10000000","AssetsTotal":"10000000","Flags":0,"LEVersion":1,"LedgerEntryType":"Vault","Owner":"rNBD9Fr2DirsjToHkpQcicpqx4wf9hz3uB","OwnerNode":"0","PreviousTxnID":"95E6D36442EBB9D36550C1D54DB88871B6BD7AE5443C71E4348436AE3D59655D","PreviousTxnLgrSeq":65184,"Sequence":64954,"ShareMPTID":"000000016D8E5748CD5FA882BDFF41D6619F430CF479D096","WithdrawalPolicy":1,"index":"84953AA75CEBE50930F987E969D7918308B7C1471253DB0BD5E55CF3334C66DF"}}`
- After: `{"xrp":1002.999856,"shares":null,"vault":{"Account":"rwzHwAnge8aHZLyRiiuvLS6CzkozdAD3Lo","Asset":{"currency":"XRP"},"AssetsAvailable":"9000000","AssetsTotal":"9000000","Flags":0,"LEVersion":1,"LedgerEntryType":"Vault","Owner":"rNBD9Fr2DirsjToHkpQcicpqx4wf9hz3uB","OwnerNode":"0","PreviousTxnID":"4A35CB34B997E6A6B1E79299960AA40E790E5CA1F320E2DE2228A52AEE6C0AB8","PreviousTxnLgrSeq":65188,"Sequence":64954,"ShareMPTID":"000000016D8E5748CD5FA882BDFF41D6619F430CF479D096","WithdrawalPolicy":1,"index":"84953AA75CEBE50930F987E969D7918308B7C1471253DB0BD5E55CF3334C66DF"}}`

### Bob recreates vault-share MPT holding for atomic test
- Transaction type: `MPTokenAuthorize`
- Validated engine result: `tesSUCCESS`
- Transaction hash: `E2C324CB7B22C8C7CB22C36F992E1FBEA1A2B71520DE0F87302522D90CB25A0D`
- Explorer: https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/E2C324CB7B22C8C7CB22C36F992E1FBEA1A2B71520DE0F87302522D90CB25A0D
- Validated ledger: `65190`
- Before: `{"account_xrp":1002.999856}`
- After: `{"account_xrp":1002.999844}`

### Atomic Batch: Bob XRP payment + Alice share transfer
- Transaction type: `Batch`
- Validated engine result: `tesSUCCESS`
- Transaction hash: `4D4686EA12DAD06318E95AC8537DA3975D63A0E04204809884570F195BF8D0F9`
- Explorer: https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/4D4686EA12DAD06318E95AC8537DA3975D63A0E04204809884570F195BF8D0F9
- Validated ledger: `65192`
- Before: `{"alice_xrp":931.999676,"bob_xrp":1002.999844,"alice_shares":{"amount":"9000000","ledger_index":"FF502FDAE9F0AFD8076590A5D161BD4B93DF40F62382020C25640D09764795A3"},"bob_shares":{"ledger_index":"F223527BD5E6F3E7BB81405ED5764081AF4E64EEA17512B3DA1A997FE0E2DF15"}}`
- After: `{"alice_xrp":932.999616,"bob_xrp":1001.999844,"alice_shares":{"amount":"8550000","ledger_index":"FF502FDAE9F0AFD8076590A5D161BD4B93DF40F62382020C25640D09764795A3"},"bob_shares":{"amount":"450000","ledger_index":"F223527BD5E6F3E7BB81405ED5764081AF4E64EEA17512B3DA1A997FE0E2DF15"}}`
- Both inner legs executed: `true`
- Fee reconciliation: Alice's XRP delta was `+999940` drops against a `1000000`-drop payment, so the validated outer Batch fee was `60` drops; Bob's delta was exactly `-1000000` drops.

### Atomic Batch forced failure
- Transaction type: `Batch`
- Validated engine result: `tesSUCCESS`
- Transaction hash: `EC8802E7B6681977021E1778C6ABF89CDCBBA238031A4B01FCC237BB11918813`
- Explorer: https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/EC8802E7B6681977021E1778C6ABF89CDCBBA238031A4B01FCC237BB11918813
- Validated ledger: `65194`
- Before: `{"alice_xrp":932.999616,"bob_xrp":1001.999844,"alice_shares":{"amount":"8550000","ledger_index":"FF502FDAE9F0AFD8076590A5D161BD4B93DF40F62382020C25640D09764795A3"},"bob_shares":{"amount":"450000","ledger_index":"F223527BD5E6F3E7BB81405ED5764081AF4E64EEA17512B3DA1A997FE0E2DF15"}}`
- After: `{"alice_xrp":932.999556,"bob_xrp":1001.999844,"alice_shares":{"amount":"8550000","ledger_index":"FF502FDAE9F0AFD8076590A5D161BD4B93DF40F62382020C25640D09764795A3"},"bob_shares":{"amount":"450000","ledger_index":"F223527BD5E6F3E7BB81405ED5764081AF4E64EEA17512B3DA1A997FE0E2DF15"}}`
- Payment and share legs unchanged: `true`
- Fee reconciliation: Alice's XRP decreased by exactly `60` drops while the forced inner legs rolled back; this is the outer Batch fee.

## Public state evidence

```json
{
  "vault_id": "84953AA75CEBE50930F987E969D7918308B7C1471253DB0BD5E55CF3334C66DF",
  "share_mpt_issuance_id": "000000016D8E5748CD5FA882BDFF41D6619F430CF479D096",
  "vault": {
    "Account": "rwzHwAnge8aHZLyRiiuvLS6CzkozdAD3Lo",
    "Asset": {
      "currency": "XRP"
    },
    "AssetsAvailable": "9000000",
    "AssetsTotal": "9000000",
    "Flags": 0,
    "LEVersion": 1,
    "LedgerEntryType": "Vault",
    "Owner": "rNBD9Fr2DirsjToHkpQcicpqx4wf9hz3uB",
    "OwnerNode": "0",
    "PreviousTxnID": "4A35CB34B997E6A6B1E79299960AA40E790E5CA1F320E2DE2228A52AEE6C0AB8",
    "PreviousTxnLgrSeq": 65188,
    "Sequence": 64954,
    "ShareMPTID": "000000016D8E5748CD5FA882BDFF41D6619F430CF479D096",
    "WithdrawalPolicy": 1,
    "index": "84953AA75CEBE50930F987E969D7918308B7C1471253DB0BD5E55CF3334C66DF"
  }
}
```

## Verdict

KILL QUESTION 1 — TRANSFER + HOLDER RIGHTS: PASS

KILL QUESTION 2 — ATOMIC SETTLEMENT: PASS

RAISE FEASIBILITY: GO
