# Node 24 LTS: compatible with the repository engines and built-in node:sqlite.
FROM node:24.21.0-alpine3.24 AS base
# Apply available security fixes within the pinned Alpine release. All stages
# use the same musl runtime, including the native Next/SWC dependencies.
RUN apk upgrade --no-cache

FROM base AS dependencies
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
COPY web/package.json web/package-lock.json ./web/
RUN npm ci --no-audit --no-fund && npm ci --prefix web --no-audit --no-fund

FROM dependencies AS build
COPY tsconfig.json ./
COPY src ./src
COPY web ./web
RUN npm --prefix web run build

FROM base AS production-dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY web/package.json web/package-lock.json ./web/
RUN npm ci --omit=dev --no-audit --no-fund \
    && npm ci --prefix web --omit=dev --no-audit --no-fund \
    && npm cache clean --force

# Keep the complete production dependencies: XRPL and ws are intentionally
# externalized by Next, so this does not rely on standalone output tracing.
FROM base AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    RAISE_MARKET_DB_PATH=/data/market.sqlite
WORKDIR /app
COPY --from=production-dependencies /app/package.json ./
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=production-dependencies /app/web/package.json ./web/
COPY --from=production-dependencies /app/web/node_modules ./web/node_modules
COPY --from=build --chown=node:node /app/web/.next ./web/.next
COPY --from=build /app/web/public ./web/public
COPY --from=build /app/web/next.config.ts ./web/next.config.ts
# The server and healthcheck invoke Node directly. Build-time package managers
# and their bundled dependencies are not needed in the shipped runtime.
RUN rm -rf /usr/local/lib/node_modules /opt/yarn-v* \
        /usr/local/bin/npm /usr/local/bin/npx \
        /usr/local/bin/yarn /usr/local/bin/yarnpkg /usr/local/bin/corepack \
    && mkdir -p /data && chown node:node /data && chmod 700 /data
USER node
WORKDIR /app/web
EXPOSE 3000
# The market snapshot reads the SQLite store but never calls the ledger. Its
# Host check deliberately uses the configured public origin, even on loopback.
HEALTHCHECK --interval=30s --timeout=8s --start-period=60s --retries=3 \
    CMD node -e "const http=require('node:http');const host=new URL(process.env.RAISE_MARKET_ORIGIN).host;const request=http.get({hostname:'127.0.0.1',port:3000,path:'/api/market',headers:{host}},response=>{response.resume();response.on('end',()=>process.exit(response.statusCode===200?0:1));});request.setTimeout(5000,()=>request.destroy(new Error('timeout')));request.on('error',()=>process.exit(1));"
CMD ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", "3000"]
