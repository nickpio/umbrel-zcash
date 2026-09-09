# Multi-stage Dockerfile for the Zcash Node Umbrel app
#
# * dev: `docker compose up` builds the **dev** stage only
# * production: a single image with the compiled backend, UI, zebrad, zakurad, and lightwalletd

###########################################
# Node binaries
#
# Each implementation ships its latest release plus the one before it so the
# Settings "pinned" preset can roll back. Keep these tags in sync with
# NODE_RELEASES in libs/settings/settings.meta.ts.
###########################################
FROM zfnd/zebra:6.3.0 AS zebra
FROM zfnd/zebra:6.2.3 AS zebra-previous
FROM zakuracore/zakura:1.3.2 AS zakura
FROM zakuracore/zakura:1.3.1 AS zakura-previous
FROM electriccoinco/lightwalletd:v0.5.0 AS lightwalletd

##########################################################
# Dependencies layer
##########################################################
FROM node:22-trixie-slim AS deps
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /repo

COPY package*.json ./
COPY apps/backend/package*.json apps/backend/
COPY apps/ui/package*.json apps/ui/

RUN npm ci --workspaces --include-workspace-root --install-strategy=hoisted

ENV PATH="/repo/node_modules/.bin:$PATH"

####################################################
# DEV-ONLY build stage
####################################################
FROM deps AS dev
WORKDIR /repo/apps/backend

VOLUME /data

COPY --from=zebra /usr/local/bin/zebrad /usr/local/bin/zebrad-6.3.0
COPY --from=zebra-previous /usr/local/bin/zebrad /usr/local/bin/zebrad-6.2.3
COPY --from=zakura /usr/local/bin/zakurad /usr/local/bin/zakurad-1.3.2
COPY --from=zakura-previous /usr/local/bin/zakurad /usr/local/bin/zakurad-1.3.1
COPY --from=lightwalletd /usr/local/bin/lightwalletd /usr/local/bin/lightwalletd

RUN ln -sfn zebrad-6.3.0 /usr/local/bin/zebrad \
 && ln -sfn zakurad-1.3.2 /usr/local/bin/zakurad \
 && mkdir -p /home/node/.cache \
 && ln -sfn /data/zebra /home/node/.cache/zebra \
 && ln -sfn /data/zakura /home/node/.cache/zakura \
 && chown -h 1000:1000 /home/node/.cache /home/node/.cache/zebra /home/node/.cache/zakura

ENV ZEBRAD_BIN=/usr/local/bin/zebrad
ENV ZAKURAD_BIN=/usr/local/bin/zakurad

CMD ["npm","run","dev"]

#################################################
# app-builder stage
#################################################
FROM deps AS app-builder
WORKDIR /repo
COPY . .

RUN tsc -b libs/shared-types libs/settings apps/backend \
 && npm run --workspace apps/ui build

########################################
# runtime stage
########################################
FROM node:22-trixie-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package*.json ./
COPY apps/backend/package*.json apps/backend/
RUN npm ci --omit=dev --install-strategy=hoisted --ignore-scripts

COPY --from=app-builder /repo/apps/backend/dist ./dist
COPY --from=app-builder /repo/apps/ui/dist ./dist/public
COPY --from=app-builder /repo/libs/settings/dist ./libs/settings/dist
COPY --from=app-builder /repo/libs/shared-types/dist ./libs/shared-types/dist

COPY --from=zebra /usr/local/bin/zebrad /usr/local/bin/zebrad-6.3.0
COPY --from=zebra-previous /usr/local/bin/zebrad /usr/local/bin/zebrad-6.2.3
COPY --from=zakura /usr/local/bin/zakurad /usr/local/bin/zakurad-1.3.2
COPY --from=zakura-previous /usr/local/bin/zakurad /usr/local/bin/zakurad-1.3.1
COPY --from=lightwalletd /usr/local/bin/lightwalletd /usr/local/bin/lightwalletd

RUN ln -sfn zebrad-6.3.0 /usr/local/bin/zebrad \
 && ln -sfn zakurad-1.3.2 /usr/local/bin/zakurad \
 && mkdir -p /home/node/.cache \
 && ln -sfn /data/zebra /home/node/.cache/zebra \
 && ln -sfn /data/zakura /home/node/.cache/zakura \
 && chown -h 1000:1000 /home/node/.cache /home/node/.cache/zebra /home/node/.cache/zakura

ENV NODE_ENV=production
ENV ZEBRAD_BIN=/usr/local/bin/zebrad
ENV ZAKURAD_BIN=/usr/local/bin/zakurad
ENV CHAIN_STATE_DIR=/data/zebra
ENV ZAKURA_DIR=/data/zakura
ENV APP_STATE_DIR=/data/app
ENV LIGHTWALLETD_DIR=/data/lightwalletd

EXPOSE 3000 8232 8233 9067
VOLUME /data

CMD ["node", "dist/server.js"]
