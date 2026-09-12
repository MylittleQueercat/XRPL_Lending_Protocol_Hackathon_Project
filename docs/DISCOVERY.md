# Market discovery decision record

## V1 decision and evidence boundary

Keep seller-posted fixed-price, full-lot asks for the local V1. The existing product scope and implemented journey support this choice: an investor advertises an existing position, another investor reviews its exposure and total price, and both approve the exact exchange. A successful test between controlled wallets demonstrates execution, not organic buyer demand.

The originating project brief identifies a seller's need to exit before the vault can supply cash. No independent prospective buyer or seller interviews have been collected for this exploration. No integrator has validated adoption. This document is a technical/product comparison with a provisional decision, not invented customer research. Those external acceptance criteria in #31 and #32 remain outstanding.

## Mechanisms compared

| Mechanism | Potential benefit | Additional requirements | Decision |
|---|---|---|---|
| Fixed-price asks | An investor advertises an exit price and a buyer evaluates it. | Exact terms, valuation context, expiry, two-party approval. | Working V1 baseline. |
| Standing bids | Buyers express demand before a matching seller lists. | Funding checks, bid lifecycle, reservation, buyer cancellation. | Consider when buyers repeatedly request positions absent from asks. |
| Request for quote | Negotiate information, quantity and price for one position. | Versioned quotes, named counterparties, bounded expiry and explicit acceptance. | First alternative to assess if actual buyers cannot accept posted asks. |
| Order book | Compare bids and asks for the same share issuance. | Sufficient participation per instrument, matching priority, partial fills and cancellation races. | Defer until observed demand justifies this complexity. |

Shares of different vaults are different instruments. A common display asset does not make their credit risk, transfer restrictions or liquidity interchangeable. The partial-fill domain/store exploration is documented separately in [PARTIAL_FILLS.md](PARTIAL_FILLS.md); it does not add a production order book.

## Minimum cross-vault comparison data

| Group | Fields and interpretation |
|---|---|
| Identity | Network, vault ID, share issuance, underlying asset, operator/broker, data source. |
| Offer | Seller, quantity, total price, unit price, expiry, lifecycle and availability for settlement. |
| Accounting | Total assets, losses, share supply, proportional net accounting claim, validated ledger and observation time. |
| Liquidity | Available cash and a cash-limited withdrawal estimate, distinct from accounting value. |
| Credit | Outstanding debt, repayment schedule, impairment/default and concentration where available. Missing information must be labelled unknown. |
| Eligibility | Share authorization/transfer restrictions and withdrawal conditions. |
| Economics | Discount/premium to accounting value and fees. A discount is not annualized yield or a guaranteed profit. |

Do not rank vaults solely by their largest discount. Comparisons require compatible assets and sufficient credit/permission information. The present V1 reads a selected vault and lists independent offers; it does not claim a credit-scoring or underwriting engine.

## External validation still required

Give prospective sellers and buyers the same concrete, sanitized offer independently. Record the seller's acceptable price, the buyer's acceptable price and required information, whether the ranges overlap after costs, and why either would decline. Do not count team-controlled faucet transactions as market demand. The idea is weakened if buyers always prefer a direct deposit at every seller-acceptable price, or cannot evaluate the available credit information.

For a potential host application, review the [launch contract](EMBED.md), wallet handoff, separate origin, return navigation and need for optional generic notifications. The decision before a production SDK is **defer**: the prototype is reviewable, but partner demand has not been established.

No new implementation issues are created for bids, RFQ, an order book or a production SDK here. Open them only after the team accepts a decision backed by the missing feedback. This keeps unvalidated ideas from becoming implied V1 commitments.
