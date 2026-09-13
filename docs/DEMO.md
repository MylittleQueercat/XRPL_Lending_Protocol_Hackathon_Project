# Raise — presentation and demo playbook

Prepared September 13, 2026. English delivery, **four minutes plus two minutes of questions**, following the [event instructions](https://app.notion.com/p/adam-hn/XRPL-Lending-Protocol-Hackathon-5cc7508f4cdc83a7991e01f90528e490). The published instructions require a live demonstration and a deck of at most ten slides; **a generated or prerecorded video is not listed as a mandatory deliverable**. A recording is useful as a labelled fallback. Confirm any later organizer request separately.

The team already has its slides and reports them ready; their file and slide count have not been independently checked here. Keep that existing deck and adapt this spoken pitch to it. [SUBMISSION.md](SUBMISSION.md) records evidence and the remaining confirmations. Timings guide presentation delivery, not development scheduling. The requested complete video is separate work, to be produced after the final application version is validated.

## Four-minute spoken pitch

### 0:00–0:25 — The problem

“An investor can own a valuable lending position and still be unable to withdraw their money today. The capital is already financing borrowers. Selling that position to someone willing to wait can solve the investor's immediate liquidity need without interrupting those loans. That is what we built with Raise.”

### 0:25–0:50 — What changes hands

“Our example is a vault financing small businesses while they wait for invoices to be paid. Alice supplies XRP and receives vault shares. Bob can later buy some of those shares at an agreed price. He acquires exposure to the pool, including its risks. He does not become the borrower, and Alice is not taking out a new loan.”

### 0:50–1:35 — The lending baseline

“Raise runs on the dedicated Track 1 network, using test XRP and an open-ended vault. Here are the vault, Alice's deposit, the broker's cover and the borrower-accepted loan. The loan transfers capital to the borrower. Alice still owns shares, but available vault cash has fallen.

“Our recorded baseline tries to withdraw one hundred XRP when only fifty is available. The ledger rejects it, and Alice's shares remain unchanged. This guardrail is the reason the secondary market matters. An open-ended vault does not promise that all its cash is available immediately.”

### 1:35–2:20 — The marketplace

“Alice lists a share lot with a total price and expiry. In a separate browser session, Bob reviews the price, accounting value and available liquidity. A discount can make waiting attractive, but it is not guaranteed profit.

“Bob authorizes receipt and signs the exchange. Alice approves the same terms from her own wallet. An atomic Batch exchanges Bob's XRP for Alice's shares. The server verifies both exact payment legs before showing a completed sale. Alice has cash; Bob holds the shares; the underlying loan continues.”

### 2:20–2:45 — Close the loop

“The borrower then repays, restoring vault liquidity. The holder can withdraw capital and realized interest. In our recorded Vanilla run, a one-hundred-XRP deposit redeemed one hundred point zero-zero-zero-one-eight-eight XRP: one hundred XRP of capital plus one hundred and eighty-eight drops of yield, before withdrawal fees. The small number is real ledger accrual. We have not accelerated time or invented a return.”

### 2:45–3:40 — Three developer findings

“Three integration findings shaped the product. First, the Track 1 ledger enables V1.1 accounting while open-ended lending still works. We use realized interest, and recommend an explicit network-to-documentation mapping.

“Second, a LoanSet grace period below sixty seconds passed SDK validation but returned a generic invalid-transaction error. A field-specific client check would avoid debugging the wrong thing.

“Third, outer Batch success does not establish that its inner payments executed. We verify exact inner hashes and validated effects. The SDK should make those outcomes easier to consume. Each finding includes reproduction context and a concrete improvement in our manual report.”

### 3:40–4:00 — Close

“Raise is Track 1, Loaded: the lending baseline uses XLS-65 and XLS-66, and Batch adds atomic payment against shares. Our V1 demonstrates the complete economic journey with independently signed trading accounts. The next product question is whether real investors want these exits at mutually acceptable prices. The application, source and transaction evidence are available for review.”

## Scene plan

| Scene | Show | Proof / presenter action |
|---|---|---|
| Problem | Raise landing and one cash-versus-capital diagram | Keep the diagram conceptual; do not animate invented account balances. |
| Roles | Alice, vault/broker, borrower, Bob | Distinguish two trading accounts from the extra operator and borrower roles. |
| Lending | Operator vault/broker/loan views, then Alice's Portfolio | Open the validated deposit and origination links; point to cash versus accounting value. |
| Guardrail | Rejected withdrawal and unchanged share quantity | Use the recorded rejection if the live fixture no longer has the same state. Label it “Recorded on network 4001”. |
| Exchange | Alice's Sell → Bob's offer page → Alice's approval | Keep wallet identities visible; never expose test seeds or a seed import screen. |
| Finality | Completed offer and recorded transaction | A success toast alone is insufficient: open transaction evidence for both payment legs. |
| Repayment | Operator repayment, then the holder's Portfolio withdrawal | Show the exact gross redemption amount and transaction fee separately. |
| DevEx / close | Three findings, repository and demo link | Keep the linked evidence available for questions. |

## Reproducible setup

1. Install the two lockfiles and start one local server using the [integration guide](INTEGRATION.md). Run `npm run doctor` to check network 4001 before a rehearsal. Prepare the operator and borrower plus two distinct trading wallets; Alice and Bob use separate browser profiles or sessions.
2. Create a transferable XRP vault and broker, fund cover, and deposit as Alice. Record the full **Vault ID**, which is a 64-character ledger identifier, not a wallet address. Add it in Portfolio if it is not discovered from the market.
3. Originate a borrower-accepted loan using the operator's labelled test-wallet flow. Confirm the validated loan and the reduction in available vault cash. Try a withdrawal exceeding that cash while Alice still holds enough shares; preserve the exact rejection.
4. List a full share lot, buy it as Bob, and approve it as Alice. If a result is pending, check the recorded transaction instead of resubmitting. Refresh both browser sessions and verify the same offer and ownership state.
5. Repay as the borrower, then withdraw as the holder. Record the gross XRP delivered, fee and remaining shares. A withdrawal of exactly the initial capital may leave a small interest-bearing remainder; withdraw the available entitlement if demonstrating complete redemption.
6. Keep the completed run's hashes, screenshots and exact application commit together. A prepared fixture makes the four-minute presentation manageable; disclose which operations were prepared or recorded.

`npm run vanilla` independently recreates the required lending baseline. `npm run market:e2e` exercises the real local API, signatures and ledger. Both send transactions on the event network. The browser fixture and API harness intentionally accept localhost origins only; they are not a public-site E2E certificate.

## Evidence to keep open

| Proof | Recorded result |
|---|---|
| [Vanilla baseline](../evidence/vanilla-flow.json) | September 12: 100 XRP deposited; 50 XRP principal lent; unavailable withdrawal rejected; repayment; 100.000188 XRP gross redemption; final shares zero. |
| [Two-browser journey](../evidence/browser-market-e2e.json) | September 12: separate trading sessions, share sale, borrower repayment and 100.00024 XRP buyer redemption. |
| [Extended UI journey](../evidence/browser-use-case-2026-09-12/README.md) | September 12: 500 XRP deposit, 300-XRP redemption after a 285-XRP purchase; 4,802 raw share units remained. Do not call this specific run a complete share redemption. |
| [Deployment](DEPLOYMENT.md) | Dated hosting checks. The release commit and scope matter; a hosted page loading does not prove an entire new trade. |

If connectivity fails, say: “The live network is unavailable from this connection. Here is our dated recorded run with its validated transaction evidence.” Do not replace a failed live operation with an unlabelled success clip. Never wait through several ledger operations during the entire pitch without a prepared fallback.

## Video and motion recommendation

Use **real application capture as the main material**, with short motion graphics to explain Alice → Bob ownership and XRP flowing in the opposite direction.

| Tool | Fit for Raise |
|---|---|
| [Screen Studio](https://screen.studio/) | Recommended Mac capture tool: cursor smoothing, automatic/manual zoom, microphone capture and subtitles help make real product actions readable. Check its current license before purchase. |
| [Remotion](https://www.remotion.dev/docs/) | Optional React-based composition for a branded opening, the two-way exchange diagram, chapter titles and captions. Good when the team wants reusable, code-controlled motion. |
| [macOS screen recording](https://support.apple.com/en-us/102618) | Built-in capture fallback if the team does not want another paid tool. Record a selected area and microphone. |

Suggested export: 1920×1080, 30 fps, readable captions, a clear human voice, and restrained motion using Raise's existing logo, cream/sage palette and system typography. Use zoom only to expose a relevant value or decision. Keep real ledger results and transaction identifiers legible. Generative footage can illustrate an opening metaphor, but cannot stand in for executed application behavior. No recording, voiceover or final video is claimed to exist merely because this playbook exists.

## Two-minute Q&A bank

| Likely question | Short answer |
|---|---|
| Why would Bob buy? | He may accept the pool's risk and waiting time in return for an acceptable price, possibly below accounting value. Demand and profit are not guaranteed. |
| Why Track 1 rather than Track 2? | The demonstrated constraint is available cash in an open-ended vault, not a subscription/investment/redemption calendar in a closed-ended vault. |
| What makes it Loaded? | Batch adds atomic payment-versus-share delivery beyond the independently runnable XLS-65/66 lending baseline. |
| Does selling hurt the borrower? | The trade changes the share holder and sends buyer cash to the seller. It does not withdraw cash from the vault or rewrite the borrower's loan. |
| Is the listed price guaranteed by the vault? | No. Accounting value, available cash and agreed market price are different quantities. Credit losses and fees affect outcomes. |
| What if a sale times out? | The recorded signed transaction remains pending. We reconcile its exact identity and effects before declaring settlement; we do not blindly send another payment. |
| Is it production ready? | This is a test-network V1 using local test wallets and one persistent server. External wallet integration, recovery operations and real demand validation remain product work. |
| Is the yield real? | Yes in the cited baseline: 188 drops gross above a 100-XRP deposit. It is small because accrual uses real elapsed ledger time. It is separate from the negotiated purchase discount. |
| Are all submission requirements complete? | The repository has evidence and prepared materials; team form submission, each developer's current hook status and team approval need their own confirmations. See the submission matrix. |
