# Raise on Sunny / Dokploy

This deployment is a public demonstration on the hackathon network **4001**, using test XRP. The shared marketplace runs in one Next.js Node process with persistent SQLite. Browser wallet seeds remain in the browser; local demo wallets and local databases are not deployed.

## Instance and source

- Public hostname: `raise.vgtray.fr`.
- Panel: `https://panel.vjuya.me`, project **Raise**, environment **production**, Compose service **Raise marketplace**.
- Server: Sunny. Inspected versions: Dokploy `0.30.5`, Docker `29.7.2`, Compose `5.5.0`.
- Git source: `https://github.com/MylittleQueercat/XRPL_Lending_Protocol_Hackathon_Project.git`, branch `main`, Compose path `./docker-compose.yml`.
- Mode: **Docker Compose**, not Swarm Stack. Automatic deployment is left disabled so a push alone does not replace the running service.
- The external, attachable overlay network is `dokploy-network`. Existing Traefik entrypoints are `web` (80) and `websecure` (443); `letsencrypt` uses HTTP-01.

**Dokploy Domains is the sole routing authority.** Adam added the domain through that tab; the Compose no longer duplicates its Traefik routers. Keep exactly one Domains entry: `raise.vgtray.fr`, service `web`, path `/`, container port `3000`, HTTPS, certificate `letsencrypt`. Dokploy injects the corresponding HTTP/HTTPS labels at deployment. The Compose still declares the external network explicitly. Do not change the global proxy or publish application ports on the host.

## Environment

Enter these non-secret values in the service Environment editor, with environment-file creation enabled:

```dotenv
RAISE_DOMAIN=raise.vgtray.fr
RAISE_IMAGE_TAG=<immutable release identifier>
RAISE_VOLUME_NAME=raise-market-data
```

All three variables are mandatory. The Domains hostname and `RAISE_DOMAIN` must match. Use a unique image tag for each code release and record its source commit and image ID. Keep the volume name unchanged. Compose explicitly passes `RAISE_MARKET_ORIGIN=https://raise.vgtray.fr` and `RAISE_MARKET_DB_PATH=/data/market.sqlite` to the container. There are no public build-time environment variables or wallet credentials to enter.

Create a **proxied Cloudflare A record** for `raise.vgtray.fr` targeting Sunny (`217.182.199.158`, orange cloud). The existing host firewall permits web ingress from Cloudflare only; a DNS-only record will time out. Any AAAA record must reach the same application. DNS is managed separately from Compose. HTTP-01 validation and HTTP-to-HTTPS routing require the existing proxy to remain reachable on ports 80 and 443. Keep end-to-end TLS validation enabled; do not switch to Flexible mode or disable certificate verification to hide a pending certificate.

## Image and readiness

The root Dockerfile installs both committed lockfiles, builds `web/`, and copies the compiled application, static assets and both sets of production dependencies. This intentionally avoids standalone tracing because the application externalizes XRPL/WebSocket dependencies from the root package.

The image uses Node `24.21.0` on Alpine `3.24`, applies available Alpine patches, and removes global npm/Yarn/Corepack from the runtime. The process runs as `node` (UID 1000) on `0.0.0.0:3000`. The `/data` directory initializes the named volume with the correct ownership. No source bind mount, development server, local Mac path or host-published port is used.

The healthcheck calls `/api/market` on loopback with the configured public Host. It proves local HTTP and SQLite availability without depending on an external ledger connection. Network readiness is verified separately from the browser.

## Deploy

1. Validate the source and lockfiles, run `npm run check` and `npm --prefix web run check`, and build/scan the candidate image.
2. Set a new `RAISE_IMAGE_TAG`, retaining the previous healthy tag and image ID for rollback. Save the environment.
3. Use **Preview Compose**. Confirm one `web` service, `expose: 3000`, no `ports`, the stable volume and the labels injected by the single Domains entry and the expected network. Do not print resolved configuration when future variables contain secrets.
4. Click **Deploy**. Confirm the deployment references the intended main commit, completes successfully and produces a healthy container.
5. Check HTTPS, HTTP redirection, static assets, `/position`, `/market`, `/sell`, `/operator`, dynamic offer/buy pages and `/api/market`. Confirm the browser connects to network 4001 and can use the faucet with a fresh test wallet.
6. Record source commit, image ID, deployment ID and checks in the deployment evidence. An image build or a green panel status alone does not prove the public route works.

For a local configuration-only check, copy `.env.example` to an ignored file, populate the three values and run:

```sh
docker compose --env-file .env.deployment-check config --quiet
```

## Persistence and backup

`raise-market-data` contains the marketplace database and WAL files. Never use **Fresh Volumes**, `docker compose down -v`, or change the volume name during an ordinary release or rollback. The current schema creates missing tables/indexes on startup; future incompatible schema changes require a migration and restore plan before deployment.

SQLite runs in WAL mode. Copying only `market.sqlite` while writes continue is not a consistent backup. Use the online backup API, then copy the resulting file to a restricted backup location outside the application volume:

```sh
docker compose exec -T web node --input-type=module -e '
import { DatabaseSync, backup } from "node:sqlite";
const db = new DatabaseSync("/data/market.sqlite", { readOnly: true });
await backup(db, "/data/market-backup.sqlite");
db.close();
'
```

Use a unique backup filename per operation in practice. Verify `PRAGMA integrity_check` on the backup and rehearse restoration into a separate volume. For a real restore, first stop application writes, retain the current volume as a recovery copy, restore the consistent backup to a new volume owned by UID 1000, and start the corresponding compatible image. Never merge a restored database with stale WAL files.

## Rollback and diagnosis

For an application rollback, retain the same database volume and use the recorded known-good image tag. In Dokploy, set `RAISE_IMAGE_TAG` to that tag and temporarily use the documented custom Compose command with `up -d --no-build --pull never --remove-orphans` instead of rebuilding the current main source. The project name and Compose path must match the service shown in Dokploy; copy its displayed command and change only those options. Confirm the resulting image ID matches the retained image. Restore the normal build command before a later forward deployment.

If the schema is incompatible, do not start old code against the new database; use the tested paired image/database restore procedure. The initial September 12 rollback rehearsal used a disposable verification volume. Later releases retain their previous image and take a fresh online backup before replacement.

Use the service Deployments and Logs tabs for build/start errors, Containers for health, and Preview Compose for routing. If HTTPS returns a proxy error, check DNS, the certificate, Host rule, `websecure`, port 3000 and `dokploy-network`. Do not solve routing problems by exposing the app port or disabling TLS validation.

## Current release — 13 September 2026

The updated branding and wallet flows are deployed at [raise.vgtray.fr](https://raise.vgtray.fr). The application revision is [`b17c06ab68ade358b18c424853594381e61958eb`](https://github.com/MylittleQueercat/XRPL_Lending_Protocol_Hackathon_Project/commit/b17c06ab68ade358b18c424853594381e61958eb), merged in [PR #52](https://github.com/MylittleQueercat/XRPL_Lending_Protocol_Hackathon_Project/pull/52). Later documentation-only commits do not change the deployed application.

- Dokploy completed the manual deployment in **1m 42s**. The running image is `raise-web:b17c06a`, ID `sha256:17c39d0a73f52319c18ffd128e632a020383c43ea9f6b47c4c806355dc7a1683`; source checkout and release commit match.
- The container is healthy and runs as `node`, with the existing `raise-market-data` volume at `/data`. SQLite integrity is `ok`; the database inode is unchanged across replacement. A fresh online backup is retained outside the volume with restricted host permissions.
- The previous image was preserved as `raise-web:rollback-20f30c7`, ID `sha256:aef499dd611c7a2733e1f15343599323161831e97d2a63037ffa6bf0ab055a6f`. The old service had reused an earlier tag, so this release records the actual image identity rather than inferring it from that tag.
- Eight public routes and **18 referenced JavaScript/CSS assets** return HTTP 200 with normal TLS validation. `/position` redirects to `/portfolio`; the shared API returns its existing two offers.
- After reloading the public Operator page, the browser reads network **4001**, ledger **89076**. The updated detail panel exposes the full Vault ID, confirms copying it, and provides prefilled Portfolio/Sell links. No console warning or error was observed in this check. No transaction was submitted through the public wallet.
- Root **281 tests** and web **119 tests**, both type checks, and the production build pass. Both production dependency audits report zero vulnerabilities. PR CI and [main CI](https://github.com/MylittleQueercat/XRPL_Lending_Protocol_Hackathon_Project/actions/runs/34747109488) pass. The September 12 container scan below is historical, not a new scan of this image.
- The separate [September 13 browser E2E](../evidence/browser-market-e2e-2026-09-13.json) covers the complete economic flow from localhost against network 4001: seller deposit, rejected unavailable withdrawal, 95-XRP share sale with separate signatures, recovery after reload, repayment and **100.000602 XRP** gross buyer redemption, with zero final shares and vault cash.

The [current deployment evidence](../evidence/deployment-smoke-2026-09-13.json) records these hosted checks and their scope. A complete trade was not repeated on the public origin. Existing team slides, the requested video, rehearsal, the human-authored DevEx report and form submission remain separate deliverables in [the submission audit](SUBMISSION.md).

## Historical verification — 12 September 2026

Deployment is running on Sunny. DNS and HTTPS now respond for [raise.vgtray.fr](https://raise.vgtray.fr). Hosted smoke checks pass; the complete local trading E2E is a separate proof, not a claim of a full trade repeated on the public origin.

- Source: [`7fd07ed9ba05d87457972daff1c80021ed9ad5b3`](https://github.com/MylittleQueercat/XRPL_Lending_Protocol_Hackathon_Project/commit/7fd07ed9ba05d87457972daff1c80021ed9ad5b3), merged in [PR #48](https://github.com/MylittleQueercat/XRPL_Lending_Protocol_Hackathon_Project/pull/48).
- Release tag: `raise-web:7fd07ed`. Retained rollback alias: `raise-web:rollback-e9db2dc`.
- Docker image ID: `sha256:8a944af7524f917eb6796c05168e1ea19c3f5ff93d7149c44ce0ed02f0f9e053`.
- Dokploy reports a successful deployment from that main commit (1m 33s). Auto-deploy is disabled. Effective container labels contain exactly the HTTP and HTTPS routers injected by the single Domains entry; the duplicate Compose routers are gone. Documentation-only follow-up commits do not require another application build.
- Current container: healthy, UID 1000, only an unbound `3000/tcp`, attached to `dokploy-network`, with `raise-market-data` mounted at `/data`.
- Local checks: root 281 tests and web 119 tests pass, including type checks; GitHub CI passes. Production build succeeds on Sunny.
- Trivy `0.74.0` scans of the candidate and final `raise-web:7fd07ed` Dokploy-built release report **zero HIGH/CRITICAL vulnerabilities**. The scanner warns that Alpine 3.24 is absent from its EOL list; this result is a dated vulnerability check, not a claim of complete security coverage.
- Eight public application/API routes return HTTP 200, including graceful empty states for unknown dynamic offer/buy IDs. Seventeen referenced JS/CSS assets pass. HTTP probes used `curl --resolve` against an authoritative Cloudflare address while the local OS DNS cache was stale; normal SNI and certificate verification remained enabled.
- SQLite integrity checks and an online backup succeed. The actual volume marker and database inode survive service restart and Dokploy redeploy. An isolated image replacement preserves a database marker; a consistent backup restores into a separate volume and starts healthy with the retained image.
- The existing Traefik returns HTTP 308 to HTTPS from Sunny, and Cloudflare returns HTTP 301 to `https://raise.vgtray.fr/`. Public HTTPS returns 200. Direct origin HTTPS on Sunny also passes normal certificate verification and returns 200; no insecure TLS option was used. Direct public-IP access times out under the existing Cloudflare-only ingress policy.
- Cloudflare authoritative DNS and Google/Cloudflare resolvers return proxied A/AAAA records. The initial NXDOMAIN/ACME failure was resolved after DNS creation and an application restart. The browser subsequently resolved the public domain normally. The origin certificate is issued by Let’s Encrypt YR1 for `raise.vgtray.fr`, expiring December 11, 2026.

- A browser on the public HTTPS origin created a fresh faucet wallet with 1,000 test XRP, connected through WSS to network 4001 and read vault `87911A8C93AC413EA8A1035E5D0CD3BB26F60364F623C75BD8BA702B4DA54FF0` at validated ledger 73549. Home, Position, Market, Sell and Operator rendered; no console warning/error or HTTP resource URL was observed in those checks. No seed was exported.

Machine-readable HTTP/browser smoke evidence is in [deployment-smoke.json](../evidence/deployment-smoke.json). This checks hosted loading, ledger reads and faucet access; it does not repeat the complete share sale/redemption E2E on the public domain. The final Domains-only effective configuration and source revision are recorded in [#45](https://github.com/MylittleQueercat/XRPL_Lending_Protocol_Hackathon_Project/issues/45), with all deployment acceptance checks completed. Demo and submission still require their own sign-off in #27–28.

## References

- [Dokploy Compose and explicit runtime environment](https://docs.dokploy.com/docs/core/docker-compose)
- [Versioned Compose domain labels](https://docs.dokploy.com/docs/core/docker-compose/domains)
- [Dokploy API](https://docs.dokploy.com/docs/api) and [Compose operations](https://docs.dokploy.com/docs/api/compose)

The existing authenticated panel is used for service configuration; SSH is used for bounded host-side build, health and persistence checks. No new API key or permission is required.
