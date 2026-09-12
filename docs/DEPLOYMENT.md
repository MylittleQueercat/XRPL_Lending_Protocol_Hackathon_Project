# Raise on Sunny / Dokploy

This deployment is a public demonstration on the hackathon network **4001**, using test XRP. The shared marketplace runs in one Next.js Node process with persistent SQLite. Browser wallet seeds remain in the browser; local demo wallets and local databases are not deployed.

## Instance and source

- Public hostname: `raise.vgtray.fr`.
- Panel: `https://panel.vjuya.me`, project **Raise**, environment **production**, Compose service **Raise marketplace**.
- Server: Sunny. Inspected versions: Dokploy `0.30.5`, Docker `29.7.2`, Compose `5.5.0`.
- Git source: `https://github.com/MylittleQueercat/XRPL_Lending_Protocol_Hackathon_Project.git`, branch `main`, Compose path `./docker-compose.yml`.
- Mode: **Docker Compose**, not Swarm Stack. Automatic deployment is left disabled so a push alone does not replace the running service.
- The external, attachable overlay network is `dokploy-network`. Existing Traefik entrypoints are `web` (80) and `websecure` (443); `letsencrypt` uses HTTP-01.

Only the versioned Compose labels configure the application domain. Leave Dokploy's Domains list empty for this service. Do not change the global proxy or publish application ports on the host.

## Environment

Enter these non-secret values in the service Environment editor, with environment-file creation enabled:

```dotenv
RAISE_DOMAIN=raise.vgtray.fr
RAISE_ROUTER_NAME=raise-marketplace
TRAEFIK_HTTP_ENTRYPOINT=web
TRAEFIK_HTTPS_ENTRYPOINT=websecure
TRAEFIK_CERT_RESOLVER=letsencrypt
RAISE_IMAGE_TAG=<immutable release identifier>
RAISE_VOLUME_NAME=raise-market-data
```

All seven variables are mandatory. Use a unique image tag for each code release and record its source commit and image ID. Keep the volume name unchanged. Compose explicitly passes `RAISE_MARKET_ORIGIN=https://raise.vgtray.fr` and `RAISE_MARKET_DB_PATH=/data/market.sqlite` to the container. There are no public build-time environment variables or wallet credentials to enter.

The DNS A record must target Sunny, or a correctly configured proxy in front of Sunny. Any AAAA record must reach the same application. DNS is managed separately from Compose. HTTP-01 validation and HTTP-to-HTTPS routing require the existing proxy to remain reachable on ports 80 and 443.

## Image and readiness

The root Dockerfile installs both committed lockfiles, builds `web/`, and copies the compiled application, static assets and both sets of production dependencies. This intentionally avoids standalone tracing because the application externalizes XRPL/WebSocket dependencies from the root package.

The image uses Node `24.21.0` on Alpine `3.24`, applies available Alpine patches, and removes global npm/Yarn/Corepack from the runtime. The process runs as `node` (UID 1000) on `0.0.0.0:3000`. The `/data` directory initializes the named volume with the correct ownership. No source bind mount, development server, local Mac path or host-published port is used.

The healthcheck calls `/api/market` on loopback with the configured public Host. It proves local HTTP and SQLite availability without depending on an external ledger connection. Network readiness is verified separately from the browser.

## Deploy

1. Validate the source and lockfiles, run `npm run check` and `npm --prefix web run check`, and build/scan the candidate image.
2. Set a new `RAISE_IMAGE_TAG`, retaining the previous healthy tag and image ID for rollback. Save the environment.
3. Use **Preview Compose**. Confirm one `web` service, `expose: 3000`, no `ports`, the stable volume and the expected labels/network. Do not print resolved configuration when future variables contain secrets.
4. Click **Deploy**. Confirm the deployment references the intended main commit, completes successfully and produces a healthy container.
5. Check HTTPS, HTTP redirection, static assets, `/position`, `/market`, `/sell`, `/operator`, dynamic offer/buy pages and `/api/market`. Confirm the browser connects to network 4001 and can use the faucet with a fresh test wallet.
6. Record source commit, image ID, deployment ID and checks in the deployment evidence. An image build or a green panel status alone does not prove the public route works.

For a local configuration-only check, copy `.env.example` to an ignored file, populate the seven values and run:

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

If the schema is incompatible, do not start old code against the new database; use the tested paired image/database restore procedure. This first deployment has no historical production release, so its rollback rehearsal targets the first validated image and a disposable verification volume.

Use the service Deployments and Logs tabs for build/start errors, Containers for health, and Preview Compose for routing. If HTTPS returns a proxy error, check DNS, the certificate, Host rule, `websecure`, port 3000 and `dokploy-network`. Do not solve routing problems by exposing the app port or disabling TLS validation.

## References

- [Dokploy Compose and explicit runtime environment](https://docs.dokploy.com/docs/core/docker-compose)
- [Versioned Compose domain labels](https://docs.dokploy.com/docs/core/docker-compose/domains)
- [Dokploy API](https://docs.dokploy.com/docs/api) and [Compose operations](https://docs.dokploy.com/docs/api/compose)

The existing authenticated panel is used for service configuration; SSH is used for bounded host-side build, health and persistence checks. No new API key or permission is required.
