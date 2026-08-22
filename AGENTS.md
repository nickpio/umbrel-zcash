# AGENTS.md

## Cursor Cloud specific instructions

This repo is the **Zcash Node** Umbrel app: a React/Vite UI + a Fastify backend that
supervises two external node processes (`zebrad` and `lightwalletd`). See `README.md`
for the product overview and the standard commands in `package.json` / `docker-compose.yml`.

### Services

| Service | Dir | Dev command | Port |
| --- | --- | --- | --- |
| Backend (Fastify) | `apps/backend` | `npm run --workspace apps/backend dev` (`tsx watch`) | 3000 |
| UI (React/Vite) | `apps/ui` | `npm run --workspace apps/ui dev` | 5173 |
| `zebrad` (full node) | external binary | spawned by the backend | RPC 8232, P2P 8233 |
| `lightwalletd` (wallet gRPC) | external binary | spawned by the backend once Zebra RPC is ready | 9067 |

`npm run dev` (repo root) starts backend + UI together. The Vite dev server proxies
`/api/*` (and websockets) to the backend at `VITE_API_BASE` (default `http://localhost:3000`),
so always browse the UI at `http://localhost:5173`, not the raw backend port.

### Node binaries are NOT installed by `npm` (important)

The backend shells out to `zebrad` and `lightwalletd`. These are **not** npm deps and are
**not** installed by the update script. The dev `docker compose up --build` path bakes them
from upstream Docker images, but Docker is not available in this environment, so run natively
and fetch the binaries yourself:

```sh
mkdir -p /home/ubuntu/bin
# zebrad: prebuilt Linux binary (needs glibc >= 2.34; this VM has 2.39)
curl -fsSL https://github.com/ZcashFoundation/zebra/releases/download/v6.3.0/zebrad-6.3.0-x86_64-unknown-linux-gnu.tar.gz \
  | tar -xz -C /home/ubuntu/bin zebrad
# lightwalletd: no binary release — build from source with Go (>=1.17; VM has go1.22)
git clone --depth 1 --branch v0.4.17 https://github.com/zcash/lightwalletd.git /tmp/lightwalletd \
  && (cd /tmp/lightwalletd && make) && cp /tmp/lightwalletd/lightwalletd /home/ubuntu/bin/
```

Then point the backend at them and run the stack:

```sh
export ZEBRAD_BIN=/home/ubuntu/bin/zebrad
export LIGHTWALLETD_BIN=/home/ubuntu/bin/lightwalletd
export DEFAULT_CHAIN=Testnet   # dev default; Mainnet triggers a much larger sync
npm run dev
```

Gotchas:
- The backend intentionally **still binds `:3000` even if `zebrad`/`lightwalletd` are missing**
  (it logs a spawn failure and serves `/api/bitcoind/status` with `running:false`). A loading
  UI does not necessarily mean the servers are down — check the binaries/env first.
- State lives under `<repo>/data/` by default (`data/zebra`, `data/app`, `data/lightwalletd`),
  which is gitignored. `CHAIN_STATE_DIR` / `APP_STATE_DIR` / `LIGHTWALLETD_DIR` override these.
- Testnet full sync is ~3.5M blocks — do **not** wait for 100%. The node answering
  `getblockchaininfo` (a few seconds after start) is enough; `lightwalletd` starts after that.
- `lightwalletd` has no upstream binary release, so the build-from-source step above is the
  only way to get it; the build downloads Go modules (needs network).

### Lint / typecheck / build

- Canonical builds (used by the Dockerfile) both pass:
  `npx tsc -b libs/shared-types libs/settings apps/backend` and `npm run --workspace apps/ui build`.
- The repo-root aggregate `npm run typecheck` (`tsc -p tsconfig.base.json`) and `npm run lint`
  **report pre-existing errors** on a clean tree: `tsconfig.base.json` does not define the UI's
  `@/` path alias (only `#settings`/`#types`), and there is existing eslint style debt in the UI.
  These are not caused by env setup. The UI's real typecheck config is `apps/ui/tsconfig.app.json`.
