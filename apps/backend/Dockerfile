# Multi-stage Dockerfile for the Zcash Node Umbrel app
#
# * dev: `docker compose up` builds the **dev** stage only
# * production: a single image with the compiled backend, UI, zebrad, zakurad, and lightwalletd

###########################################
# Node binaries
###########################################
FROM zfnd/zebra:6.3.0 AS zebra
FROM zakuracore/zakura:1.2.0 AS zakura
FROM electriccoinco/lightwalletd:v0.4.17 AS lightwalletd

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

COPY --from=zebra /usr/local/bin/zebrad /usr/local/bin/zebrad
COPY --from=zakura /usr/local/bin/zakurad /usr/local/bin/zakurad
COPY --from=lightwalletd /usr/local/bin/lightwalletd /usr/local/bin/lightwalletd

RUN mkdir -p /home/node/.cache \
 && ln -sfn /data/zebra /home/node/.cache/zebra \
 && ln -sfn /data/zakura /home/node/.cache/zakura \
 && chown -h 1000:1000 /home/node/.cache /home/node/.cache/zebra /home/node/.cache/zakura

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
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package*.json ./
COPY apps/backend/package*.json apps/backend/
RUN npm ci --omit=dev --install-strategy=hoisted --ignore-scripts

COPY --from=app-builder /repo/apps/backend/dist ./dist
COPY --from=app-builder /repo/apps/ui/dist ./dist/public
COPY --from=app-builder /repo/libs/settings/dist ./libs/settings/dist
COPY --from=app-builder /repo/libs/shared-types/dist ./libs/shared-types/dist

COPY --from=zebra /usr/local/bin/zebrad /usr/local/bin/zebrad
COPY --from=zakura /usr/local/bin/zakurad /usr/local/bin/zakurad
COPY --from=lightwalletd /usr/local/bin/lightwalletd /usr/local/bin/lightwalletd

RUN mkdir -p /home/node/.cache \
 && ln -sfn /data/zebra /home/node/.cache/zebra \
 && ln -sfn /data/zakura /home/node/.cache/zakura \
 && chown -h 1000:1000 /home/node/.cache /home/node/.cache/zebra /home/node/.cache/zakura

ENV NODE_ENV=production
ENV CHAIN_STATE_DIR=/data/zebra
ENV ZAKURA_DIR=/data/zakura
ENV APP_STATE_DIR=/data/app
ENV LIGHTWALLETD_DIR=/data/lightwalletd

EXPOSE 3000 8232 8233 9067
VOLUME /data

CMD ["node", "dist/server.js"]
