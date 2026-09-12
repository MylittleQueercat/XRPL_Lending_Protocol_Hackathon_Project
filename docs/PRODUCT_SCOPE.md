# Raise product scope

## 1. Product statement

Raise is a secondary market and secondary-liquidity layer for XRPL lending-vault shares. It lets an investor transfer a vault-share position to another investor at an agreed secondary-market price. Raise does not liquidate, move, or directly resell the underlying borrower loans.

## 2. Borrower profile

The target borrower is a small or mid-sized business with predictable incoming receivables and a temporary cash-flow gap. Typical needs include payroll, inventory, supplier payments, or bridging the delay between issuing an invoice and receiving payment.

## 3. Lender and investor profile

The target lender or investor is an investor or treasury manager willing to provide capital to a pooled business-credit vault. They accept credit and liquidity risk in exchange for the vault's economic exposure.

## 4. Demo asset

The demo uses XRP on the Track 1 hackathon network. This is a demonstration asset only; it does not imply that XRP would be the production asset.

## 5. Why borrowers need credit

Business expenses occur today while receivables arrive later. Short-term working-capital credit addresses that timing mismatch; it does not eliminate the underlying business or repayment risk.

## 6. Why lenders may need secondary liquidity

Vault capital can be deployed in outstanding loans. An investor can own sufficient vault shares but be unable to redeem their full position immediately when the vault lacks enough available liquidity. Raise offers a second route: sell the investor's vault-share position to another investor instead of requiring the vault to provide immediate liquidity.

## 7. Why buy existing shares instead of making a new deposit

A buyer may choose an existing share position because:

- the seller may offer it at a discount to displayed accounting value;
- the buyer may prefer exposure to an already-existing, seasoned loan portfolio;
- the agreed secondary-market price can reflect liquidity, credit, and waiting risk.

None of these imply guaranteed profit, guaranteed yield, or that a buyer will accept a given price.

## 8. What is being sold

The seller transfers a vault-share position, represented by the vault-share MPT. The underlying borrower loans remain in the vault and continue under their normal loan terms. Raise transfers the investor's economic position in the vault; it does not transfer individual `Loan` objects.

## 9. What Raise does not promise

Raise does not promise:

- an instant exit;
- guaranteed liquidity;
- guaranteed yield or profit;
- that a buyer will always exist;
- that shares will trade at accounting value;
- direct resale of individual borrower loans;
- liquidation or movement of underlying borrower loans.

## 10. Track and flavour scope

Track 1's open-ended vault is the chosen environment. XLS-65 and XLS-66 are the Vanilla baseline for the lending and vault workflow.

Raise's current feasibility work uses `Batch` for atomic XRP-payment-for-vault-share settlement. `Batch` is an additional ledger primitive beyond that Vanilla baseline. Therefore, if Batch remains in the final submission, the submission must **not** be described as Vanilla; the final flavour should be confirmed with mentors and may be Loaded. This document uses “Track 1 Vanilla baseline” only to describe the underlying XLS-65/XLS-66 environment, not to classify a final Batch-enabled submission.

## 11. Demo story

An SME borrower needs short-term working capital. An investor deposits into an open-ended vault, and the vault funds an SME loan. Later, that investor wants liquidity, but the vault does not have sufficient available liquidity for a full withdrawal. The investor offers vault shares through Raise. A buyer accepts the position at an agreed market price, then the shares and payment settle. The underlying SME loan continues normally, while the buyer now owns the vault-share position.
