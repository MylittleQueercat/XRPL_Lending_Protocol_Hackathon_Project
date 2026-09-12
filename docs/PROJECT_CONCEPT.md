# Raise — A Secondary Market for XRPL Vault Shares

> Team discussion document · Version 1.0 · September 12, 2026
>
> This document captures the initial product proposal for the team to develop together. It separates the product vision, hackathon requirements, and technical assumptions that still need validation. It is not evidence of a working integration or a claim that the team has approved every decision.

## 1. The idea

**Allow an investor to offer their XRPL vault shares to another investor when they want to exit and the vault does not have enough available liquidity to fulfil their withdrawal.**

The seller receives payment from the buyer. The buyer becomes the shareholder and takes over the exposure associated with those shares. The underlying loans continue normally.

Working name: **Raise**. Product description: **a secondary market for vault shares**.

## 2. The problem

An investor deposits assets into a vault. The vault's capital finances loans. When the investor wants to withdraw, some of that capital may still be outstanding with borrowers, leaving insufficient available liquidity for the requested withdrawal.

In an **open-ended vault**, deposits and withdrawals remain open throughout the vault's lifetime, subject to protocol rules and available liquidity. The loans have a term; the vault does not. Holding vault shares therefore does not automatically mean signing a personal five-year lockup.

Raise would offer an alternative exit route: finding a buyer for the shares. An exit still requires a willing counterparty and an agreed price. A marketplace does not automatically create liquidity.

The initial use case could be a vault financing business credit. The exact borrower profile and investment proposition remain team decisions.

## 3. What is actually being sold?

XLS-65 represents ownership of a vault through **Multi-Purpose Token (MPT) shares**. These shares may be transferable depending on the vault configuration and applicable permissions.

The sale concerns a quantity of vault shares representing a proportion of the vault's assets. It is not necessarily a claim against a particular borrower, and it is not a proposed transfer of the individual `Loan` ledger object.

| Term | Meaning in this project |
|---|---|
| Primary market | Depositing assets into a vault in exchange for shares. |
| Secondary market | Trading existing shares between investors. |
| Withdrawal | Redeeming shares for available vault assets under protocol rules. |
| Resale | Exchanging shares for a buyer's payment; that payment does not come from the vault. |
| Accounting value | The position's value derived from the vault's accounting. |
| Market price | The price offered or accepted by a seller and buyer. |

## 4. Illustrative example

These numbers are fictional. They do not imply a fixed native conversion between MPT units and XRP.

1. Alice owns **800 shares**, with an accounting value of **1,000 XRP**.
2. The vault has **50 XRP** in available liquidity. Alice cannot withdraw her entire position.
3. Alice lists her 800 shares for **950 XRP**.
4. Bob reviews the vault and accepts that price.
5. Alice receives 950 XRP; Bob receives the 800 shares.
6. Borrowers continue repaying the vault.
7. Bob can request a withdrawal when protocol rules and available liquidity allow it.

The 50 XRP difference is a **5% discount to the displayed accounting value**. It is not a guaranteed profit for Bob. The position's value may change, losses may occur, and the wait for liquidity remains a risk.

The economic hypothesis is that some investors accept a discount to exit, while others accept the holding period and portfolio risk at a price they find attractive. We need to test why a buyer would purchase an existing position instead of depositing directly into the vault.

## 5. Hackathon alignment

**Bootstrap target: Track 1, open-ended vault, Lending Protocol V1.** The shared foundation targets this environment. The endpoint currently advertises V1.1 as enabled, so open-ended loan origination is blocked until compatibility is resolved; see the README and issue #2. The broader product choices remain open for team discussion.

| Component | Role in Raise |
|---|---|
| XLS-65 — Single Asset Vault | Vault creation, deposits, ownership shares, and withdrawals. |
| XLS-66 — Lending Protocol | Loan broker, loan agreement, funding, repayments, and loan management. |
| Secondary market | Product layer for discovering offers and settling share sales. |

**Track and flavour are separate choices.** Track 1/2 determines the vault model, protocol version, and network. Vanilla/Loaded describes the primitives used in the submission. Moving to Loaded does not mean switching to Track 2.

### Required Vanilla baseline

For Track 1, the event requires:

- Creating an open-ended Single Asset Vault.
- Depositing capital from at least one lender.
- Setting up a loan broker and originating a loan accepted by the borrower.
- Executing a drawdown and verifying the borrower actually received the funds.
- Processing at least one repayment.
- Withdrawing capital plus yield, documented according to the network's accounting model.
- Demonstrating a transaction rejected by a protocol guardrail.
- Wrapping the flow in a credible use case.

Our preferred guardrail is **a withdrawal that exceeds available vault liquidity while the investor owns enough shares to cover the request**. A rejection caused only by an insufficient personal share balance would not demonstrate Raise's target problem.

A marketplace interface without this lending flow does not satisfy the baseline.

### Extension targeting Loaded

Loaded adds another ledger primitive with a meaningful purpose. The share sale's settlement mechanism is a natural candidate, subject to actual network support.

Loaded eligibility must not be inferred from the number of screens or the word “marketplace.” MPT shares already inherent in the vault do not automatically establish an additional Loaded feature. We should identify the added primitive and confirm its classification with the mentors.

## 6. Product vision

The proposed form is a web application with an exit module integrated into the investor journey. The same module could later be embedded into other lending applications.

### My position

- Connect a wallet compatible with the selected network.
- View shares held and the associated vault.
- Distinguish accounting value, available liquidity, and loan information.
- Deposit or request a withdrawal.
- Understand why a withdrawal is unavailable.
- Offer shares for sale.
- Track personal offers, acquired positions, and confirmed operations.

### Secondary market

- Browse available share offers.
- Identify the vault and settlement asset.
- See quantity, total price, and correctly scaled unit price.
- Compare the price with accounting value without confusing a discount with yield.
- Review the information needed to assess the position.
- Buy an offer and follow settlement.

### Offer details and confirmation

- Exact quantity and agreed price.
- Portfolio risks, available liquidity, and known restrictions.
- Any fees disclosed before confirmation.
- Expiration, cancellation, and execution conditions.
- Required permissions and signatures.
- Confirmed outcome and transaction evidence.

### Operator and borrower flow

The prototype must also support vault creation, broker configuration, loan acceptance and funding, and repayment. These operations can begin as scripts before being integrated into dedicated screens.

### Broader vision to discuss

After proving a complete sale: partial sales, multiple vaults, requests for quotes, buy and sell orders, an order book, notifications, and an embeddable module. These are possible extensions, not claims about currently available capabilities.

## 7. Proposed architecture

```text
Seller / current investor                   Buyer / new investor
           |                                         |
           +-------------- Raise UI -----------------+
                              |
                    Offers and information
                              |
                   Payment / share settlement
                              |
                            XRPL
                              |
                    XLS-65 vault and shares
                              |
                        XLS-66 broker
                              |
                       Loans / borrowers
```

**On the ledger:** share ownership, vault state, loans, repayments, transfers, and settlement through the selected primitives.

**In the application:** presentation, offer discovery, explainable calculations, and transaction preparation. If offers are stored off-chain, the server is not proof of ownership and cannot guarantee an offer remains executable.

**In the wallets:** participant authorization. The signing flow must be validated before selecting a wallet connector.

The ledger remains the source of truth. The application reads confirmed results rather than treating submission as success. The exact architecture depends on settlement validation; this proposal does not assume that Raise takes custody of user funds.

## 8. Technical questions to resolve

### A. Share transferability and buyer rights

Create a correctly configured vault, transfer its shares between accounts, identify required authorizations, and demonstrate withdrawal by the new holder once liquidity is available. Handle non-transferable shares and unauthorized accounts explicitly.

### B. Safe sale settlement

**A successful share transfer is not proof of a successful sale.** Payment and share delivery should either both apply or neither apply. Any network fees must be distinguished from the exchanged assets.

Candidate mechanisms to investigate:

- Native DEX execution, only if the network and SDK actually support trading these MPT shares.
- An all-or-nothing `Batch`, only if the available version supports the required operations and signatures.
- Any alternative must state its guarantees and assumptions before adoption.

General MPT documentation and the XLS-82 proposal do not establish activation on the hackathon network. Likewise, a reference to `Batch` in documentation does not prove that it is available there.

### C. V1 accounting and pricing

V1 accounting may recognize scheduled interest at origination. Separate accounting value, principal, received repayments, future interest, and available liquidity. Do not add future interest again if it is already included in the displayed value.

The first version can let the seller choose a price. An automated “fair price” or annualized return should not be introduced until its assumptions and underlying cash flows are understood.

### D. Offer validity

A seller may move their shares, an offer may expire, or another transaction may consume a balance. Check validity at settlement, prevent double execution, and refresh offers that become unavailable.

### E. Network compatibility

Track 1 must support new open-ended-vault loans under V1. Verify the actual network configuration before attributing an error to the SDK.

## 9. Dependency-based roadmap

This roadmap deliberately contains **no development time estimates or imposed schedule**. Progress is based on evidence and team decisions.

| Stage | Work | Evidence required before proceeding |
|---|---|---|
| 1. Environment | Inspect existing work; install compatible tools and SDK; configure the network; verify the DevEx hook; create and fund accounts. | Exact version, identified network, and a basic confirmed transaction with a working explorer link. |
| 2. Vault | Create a transferable-share vault, deposit, and read share balances. | Consistent vault state and balances. |
| 3. Vanilla lending | Configure the broker, obtain loan acceptance, verify disbursement, repay, and withdraw capital with yield. | A complete confirmed cycle with explained accounting. |
| 4. Exit problem | Demonstrate insufficient available liquidity for a withdrawal backed by enough shares. | A rejected transaction with the correct cause. |
| 5. Transfer | Move shares to another account and verify the new holder's rights. | Transferred ownership and successful withdrawal when funds are available. |
| 6. Sale | Prove payment-versus-shares settlement using the selected primitive. | Successful sale, failure without unilateral delivery, and no double execution. |
| 7. Product | Integrate positions, offers, details, signatures, and results into the UI. | A complete user journey using network data. |
| 8. Robustness | Test cancellation, expiration, insufficient funds, restrictions, and interrupted flows. | Reproducible results and consistent states. |
| 9. Deliverables | Consolidate README, transaction evidence, DevEx report, slides, and demonstration. | Covered event requirements and explicitly stated limitations. |

Friction capture begins in Stage 1. Transfer and settlement feasibility can be investigated alongside the baseline, before investing in sales screens.

If settlement is unavailable, the Vanilla baseline remains useful, but **the functional marketplace remains unproven**. A mockup, a transfer alone, or two independent payments must not be presented as a successful atomic sale.

### Proposed Track 1 configuration

| Item | Reference |
|---|---|
| Protocol | Lending Protocol V1, open-ended vault |
| SDK | `xrpl.js@5.2.0-beta.1`, pinned after the September 12 event update supplied to the team |
| RPC | `https://lending-hackathon.dev.ripplex.io:51234` |
| WSS | `wss://lending-hackathon.dev.ripplex.io:51233` |
| Faucet | `https://lending-hackathon-faucet.dev.ripplex.io/accounts` |
| Explorer | `https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/` |

Do not mix this setup with Track 2, which uses Public XRPL Devnet and a different vault lifecycle. The earlier event snapshot listed `xrpl.js@5.2.0-beta.0`; the subsequent update supplied to the team points to `5.2.0-beta.1`. The current pin is recorded in `package.json`; SDK changes do not establish network compatibility. RLUSD from tryrlusd.com is on Testnet, not these Devnets. XRP is proposed for the first vault and settlement flow; other assets remain an open team decision.

## 10. Target demonstration

**Deposit → funded loan → withdrawal rejected for insufficient liquidity → sale offer → purchase → loan repayment → withdrawal by the buyer.**

The audience should be able to observe:

- Why the seller cannot withdraw the entire position.
- What the buyer acquires and why the price might be attractive.
- The payment received and the shares transferred.
- The loan continuing after the sale.
- The new holder exercising the withdrawal right.

Clearly distinguish live operations from evidence of previously completed operations. Loan scenarios must respect protocol timing rules; an illustrative economic duration must not be presented as time that actually elapsed on the ledger.

## 11. Developer experience and event deliverables

The event weights **developer feedback at 40%, XRPL execution at 30%, creativity/use case at 20%, and presentation at 10%**.

For each friction actually encountered, record: category, title, attempted action, expected and actual results, reproduction steps, code or transaction link, severity, exact library version, and a proposed improvement. The event's categories are client libraries, UX, missing primitive, documentation/tutorials, and other.

Relevant observation areas include reading positions, available liquidity, share configuration, multi-party signatures, SDK support, V1 accounting, transfer and settlement, error messages, and explorer consistency. These are investigation topics, not claims of defects already found.

Required deliverables:

- Public GitHub repository, published after team approval.
- README covering the product, setup, track, flavour, environment, exact library version, and XLS-65/66 transactions used.
- Links to genuinely verified on-chain transactions.
- Slide deck of up to ten slides.
- Manual DevEx report of up to three pages at the repository root, with the technical context at the top.
- Completed DevEx form with team members and GitHub handles.
- Local DevEx hook on every developer's machine, complementing the manual report.
- Four-minute demonstration and two-minute Q&A, covering the use case, on-chain flow, three main friction points, and proposed improvements.

Potential protocol security issues must remain private and be raised with a mentor before presentation, as required by the event. This document is not a security disclosure.

## 12. Current status and open assumptions

| Topic | Status |
|---|---|
| Use of XLS-65 and XLS-66 | Aligned with the concept and the required baseline. |
| Track 1 open-ended | Proposed direction following the initial request. |
| Transferable shares | Supported as a configuration in XLS-65; actual configuration and behavior need verification. |
| Sale settlement on the hackathon network | Not demonstrated at this stage. |
| Loaded classification | To confirm based on the additional primitive actually used. |
| Buyer demand and market depth | Product hypotheses requiring validation. |
| Interactive mockup | Local illustration with fictional data and no connected real wallet. |
| Final integration and production availability | Not delivered as part of this concept document. |

## 13. Team decisions and contributions

- [ ] Confirm the name and product statement.
- [ ] Confirm Track 1 and the concrete borrower use case.
- [ ] Identify the initial seller and buyer audiences.
- [ ] Confirm XRP as the initial vault and settlement asset.
- [ ] Define loan terms and coverage parameters.
- [ ] Validate share transferability and authorization requirements.
- [ ] Prove and select the settlement mechanism.
- [ ] Define the minimum loan and vault information shown to buyers.
- [ ] Choose whole-position or partial sales for the initial version.
- [ ] Define pricing, cancellation, expiration, and any fees.
- [ ] Assign ownership across XRPL integration, interface, and evidence/DevEx.
- [ ] Prioritize extensions after the complete flow is validated.

### Suggested contribution format

For each addition, document:

1. **Proposal:** what should change or be added?
2. **User need:** whose problem does it solve?
3. **Journey impact:** how does it change the product flow?
4. **XRPL dependency:** which capability does it require?
5. **Evidence:** what would demonstrate it works?
6. **Team decision:** proposed, accepted, deferred, or rejected, with a short reason.

This keeps the document collaborative while preserving a clear distinction between ideas and validated capabilities.

## 14. Reference sources

The event rules were read in the shared Notion tab on September 12, 2026. Specifications describe capabilities; their presence in documentation is not evidence of activation on a particular network.

- [Hackathon rules — Notion](https://app.notion.com/p/adam-hn/XRPL-Lending-Protocol-Hackathon-5cc7508f4cdc83a7991e01f90528e490)
- [XLS-65 — Single Asset Vault](https://github.com/XRPLF/XRPL-Standards/tree/master/XLS-0065-single-asset-vault)
- [XLS-66 — Lending Protocol](https://github.com/XRPLF/XRPL-Standards/tree/master/XLS-0066-lending-protocol)
- [Create a Single Asset Vault tutorial](https://xrpl.org/docs/tutorials/defi/lending/use-single-asset-vaults/create-a-single-asset-vault)
- [Reference lending/SAV application](https://github.com/ripple/xrpl-reference-app-lending-sav)
- [JavaScript and Python sample scripts](https://github.com/RippleDevRel/xrpl-js-python-simple-scripts)
- [MPT documentation](https://xrpl.org/docs/concepts/tokens/fungible-tokens/multi-purpose-tokens)
- [XLS-82 — MPT integration into the DEX](https://xls.xrpl.org/xls/XLS-0082-mpt-dex.html)
- [Batch documentation](https://xrpl.org/docs/references/protocol/transactions/types/batch)
- [XRPL DevEx hook](https://github.com/RippleDevRel/xrpl-devex-hook)
- [Lending Protocol V1.1 — Track 2 reference](https://opensource.ripple.com/docs/lending-protocol-v1-1)

**Proposed pitch:** “Raise lets investors offer their XRPL vault shares to other investors when available liquidity cannot cover their withdrawal, without interrupting the underlying loans.”
