# Shared marketplace integration and recovery

## Runtime

Use Node 24.11.1 or a compatible Node 24 release. Install the committed root and web lockfiles. The application uses `xrpl@5.2.0-beta.1`, network 4001, the event lending endpoint and faucet-funded test XRP. Both actors connect to one Next.js Node server with persistent SQLite storage.

```sh
npm ci
cd web
npm ci
npm run dev
```

The default URL is `http://localhost:3000`. For another origin, set `RAISE_MARKET_ORIGIN` to the exact origin on the server. For example:

```sh
RAISE_MARKET_ORIGIN=http://127.0.0.1:3100 npm run dev -- --hostname 127.0.0.1 --port 3100
```

Do not mix `localhost` and `127.0.0.1` between browser and server configuration. `RAISE_MARKET_DB_PATH` may select an absolute persistent database path; by default it is `web/.local/market.sqlite`. This is a single-host deployment with enabled master-key test wallets. It does not support independent replicas, regular-key authentication or account multisigning. Restart the server after changes to core/server modules so its long-lived runtime uses the new code. Production builds use the same Webpack Node externals.

## Buyer and seller on localhost

1. Open two independent browser sessions or freshly created tabs, not a duplicated tab that may inherit session storage. Create one faucet wallet in each and verify that their public addresses differ. No actor asks for the other actor's seed.
2. Load a funded lending vault in the seller's Position screen. The seller holds shares while loans reduce available cash; accounting ownership and immediate withdrawal capacity are shown separately.
3. The seller opens Sell, selects the vault, enters the full-lot quantity, total XRP price and expiry, reviews the terms and signs the listing intent. Share the resulting offer URL with the buyer.
4. The buyer authorizes receiving the share issuance if necessary, requests the purchase, then signs the exact prepared Batch authorization. The request is durable and visible to the seller.
5. The seller opens the same purchase page, reviews the payment, shares and outer fee, then approves and submits the Batch from their own wallet. The server broadcasts the persisted blob once.
6. If validation is pending, use **Check recorded transaction**. Only verified outer and inner transaction metadata changes the offer to settled. A refresh never sends another payment.
7. After the borrower repays, the buyer refreshes Position and withdraws available cash. This burns the corresponding vault shares; it is a separate transaction from buying them.

The operator and borrower exist in addition to the two marketplace actors. For a controlled browser verification, `scripts/browser-fixture.ts` creates those two fresh operator accounts in memory, waits for the seller's UI deposit, originates the test loan, waits for the browser sale, repays, and waits for the buyer's UI redemption. Its `--help` is read-only; `--start` explicitly sends test-network transactions. Keep the process alive throughout the journey. It does not load browser keys or resume financial operations automatically.

## Verification boundaries

`npm run check` at the root and in `web/` runs offline type checks and behavior tests. The suites cover exact NUMBER/scientific arithmetic and losses, origin/action/nonce binding, signature mutation, concurrent reservation and broadcast, restart/replay, missing or inconsistent ledger proof, transport cleanup, storage failure, faucet funding interruptions and wallet disconnect during preparation.

With the server running, `npm run market:e2e` at the root runs the real HTTP API, SQLite, production client signing helpers and event ledger with four fresh actors. The complete verified result is [market-e2e.json](../evidence/market-e2e.json). It covers deposit, loan, rejected unavailable withdrawal, shared listing, buyer/seller signatures, atomic purchase, repayment and buyer redemption. Balances and holdings are pinned to validated ledgers. No simulated success substitutes for a missing transaction.

The browser fixture is a separate check: the seller and buyer operate the actual UI, with lending prepared by the fixture. The successful run is recorded in [browser-market-e2e.json](../evidence/browser-market-e2e.json): seller deposit, rejected withdrawal, shared listing, separate buyer/seller approvals, production-server restart while pending, exact-hash reconciliation and buyer redemption. The buyer received 100.000635 test XRP on redemption and the remaining share supply became zero. This scope is distinct from the Node API harness and from `web/verify/wallet.verify.ts`, which uses explicit storage/Web Lock stand-ins while submitting a real ledger transaction.

## Recovery guarantees and limitations

- A one-use wallet intent binds the exact action, account, origin, nonce, expiry and network. Disabled master keys are rejected before business mutations.
- A server-side reservation and immutable transaction hash survive process restarts. Two concurrent buyers cannot reserve the same offer; two submit requests do not cause two broadcasts.
- Both inner Payments must be validated in the same ledger, reference the exact parent Batch hash and deliver the exact XRP/MPT amounts. API v2 `DeliverMax` is normalized to the serialized `Amount` field for hashing; conflicting values are rejected.
- An outer `tesSUCCESS` alone never proves an exchange. Missing history or a timeout keeps the attempt pending. Expiry and cancellation cannot revoke a previously signed authorization.
- Failed or expired signed attempts remain locked for operator investigation. Automatic rebooking, cancelling signed transactions and a general recovery administration UI are not implemented.
- Single-account browser submissions require Web Locks and a persistent public-hash journal before broadcasting. A timeout preserves that record and blocks a second transaction from the account. Read-only reconciliation clears only a validated matching identity.
- Faucet wallets are saved in session storage before funding verification. A funding RPC failure does not lose the generated wallet or enable signing. Reload checks the same saved identity.
- Disconnect/reconnect cancels old SDK reconnect timers; late completion of a cancelled connection cannot become the current client.
- Local development wallet seeds remain in their own browser session. The marketplace API accepts no seed. The operator-only LoanSet screen still has a clearly labelled local borrower test-seed co-signing limitation; an external wallet handoff for that screen is future work.

## Failures actually found during integration

The first HTTP check rejected a valid local origin because Next rewrote its internal request URL; exact configured Host/Origin checks now cover that case. The initial Webpack build bundled the root SDK's WebSocket native adapter incorrectly; Node externals fixed the observed `bufferUtil.mask` failure. A real sale initially remained pending because API v2 uses `DeliverMax` in Payment responses; canonical normalization was reproduced against the recorded transactions and covered by regression tests. A development runtime restart was required to load that core verifier change. No failed attempt was blindly resubmitted.

The independent review also found fractional/scientific amount handling, omitted unrealized losses, faucet identity loss after RPC interruption and orphaned reconnect timers. Those application defects have focused regression tests. These findings are application/integration behavior, not a claim of a protocol security vulnerability.

## Loaded classification

The [event Notion](https://app.notion.com/p/adam-hn/XRPL-Lending-Protocol-Hackathon-5cc7508f4cdc83a7991e01f90528e490), re-read on September 12, defines Loaded as the Vanilla lending baseline plus another useful ledger primitive. Raise's additional primitive is **Batch (XLS-56)** for atomic XRP payment against vault-share delivery. Native vault shares alone are not the claimed extension. The [live amendment check](../evidence/loaded-amendments.json) reports `BatchV1_1` enabled on network 4001; the actual SDK signing support and two-leg settlement are evidenced in the complete run; the Vanilla baseline remains independently runnable with `npm run vanilla`. This is the project's documented mapping to the published definition, not a claim of private mentor approval or a guaranteed judging outcome.

Partial-fill persistence/rounding and the embedding boundary are exploration prototypes documented in [PARTIAL_FILLS.md](PARTIAL_FILLS.md) and [EMBED.md](EMBED.md). External customer and integrator feedback remains uncollected, as recorded in [DISCOVERY.md](DISCOVERY.md). Slides and submission work are outside this integration change.

## Recorded verification outcome

Root: 257 tests and typecheck passed. Web: 109 tests, typecheck and production build passed. Both npm audits reported zero known vulnerabilities. Independent QA ran 79 relevant cases and found no remaining blocking issue in the reviewed changes. The browser verification found and corrected invalid nested HTML in loading stats and a stale-share warning incorrectly shown after a successful sale; historical offers whose supply was fully redeemed now show unavailable current valuation. These checks do not claim production certification or customer demand.
