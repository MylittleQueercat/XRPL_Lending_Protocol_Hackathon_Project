# Browser use case, 12 September 2026

The complete Raise journey driven through the real interface with Playwright: four faucet wallets
(operator, borrower, Alice the seller, Bob the buyer), two browser contexts for the two-party sale,
every transaction validated on the Track 1 network (4001, rippled 3.4.0-rc1).

| Step | Actor | Transaction | Result |
|---|---|---|---|
| 1 | Operator | VaultCreate | vault `69A5C989…` |
| 2 | Alice | VaultDeposit 500 XRP | 500 000 000 shares at NAV 1.00 |
| 3 | Operator | LoanBrokerSet, LoanBrokerCoverDeposit 50 XRP | broker `135EA79F…` |
| 4 | Operator + Borrower | LoanSet 400 XRP, 100 % annualised, 12 × 30 days, close fee 5 | vault 80 % utilised, 100 XRP cash |
| 5 | Alice | VaultWithdraw 300 XRP | **tecINSUFFICIENT_FUNDS**, the liquidity wall; shares untouched |
| 6 | Alice | Marketplace offer: 300 000 000 shares for 285 XRP (−5 % to NAV), 24 h | offer `d27faadc…` |
| 7 | Bob | MPTokenAuthorize, purchase request, buyer signature | awaiting seller |
| 8 | Alice | Approve and submit: one Batch, two inner Payments | `F0CB5B69…` tesSUCCESS, ledger 74 622 |
| 9 | Borrower | LoanPay, full early repayment | tesSUCCESS; Loan object stays on the ledger with principal 0 |
| 10 | Bob | VaultWithdraw 300 XRP | tesSUCCESS, `44DB327E…`, ledger 74 976 |

Final balances (XRP): operator 952.999952, borrower 994.991985, Alice 784.999916, Bob 1014.999976.
Bob paid 285 XRP and withdrew 300 XRP once the repayment brought the cash back; he keeps 4 802
share units because the repayment realised a little interest, so the NAV rose above 1.00. Alice still
holds 200 000 000 shares.

Two things the run surfaced and that were fixed afterwards:

- After the seller's submission the marketplace recorded the attempt as pending (an ambiguous
  network response); the read-only "Check recorded transaction" reconciliation confirmed the Batch
  from the ledger without any resubmission, as designed.
- Loan objects live in the borrower's and the broker pseudo-account's owner directories, not the
  operator's. The operator desk now reads loans through the broker pseudo-account
  (`readLoansForBrokers`), and a loan paid down to zero is shown as "Repaid" rather than "Performing".

Files: numbered screenshots of each step, `summary.json` (ids and final balances), `log.txt`
(timeline, seeds removed). Wallet seeds are not committed.
