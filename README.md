# Zcash Node

Run a Zcash full node on umbrelOS. Powered by [Zebra](https://zebra.zfnd.org) with [lightwalletd](https://github.com/zcash/lightwalletd) so wallets such as Zashi, Ywallet, and Zingo can connect to your own node.

This app is a fork of [umbrel-bitcoin](https://github.com/getumbrel/umbrel-bitcoin) with the same dashboard, insights, and settings style.

## Architecture

- **Zebra (`zebrad`)** — consensus full node. JSON-RPC on port `8232`, P2P on `8233`.
- **lightwalletd** — compact-block gRPC server on port `9067`. This is the wallet connection surface (the Electrum equivalent).
- **App UI** — React dashboard served by a Fastify backend that manages both processes.

## Development

```sh
docker compose up --build
```

The UI is at `http://localhost:5173`. Dev defaults to **Testnet**.

Connect a light wallet once Zebra has some blocks and lightwalletd is running:

```sh
zingo-cli --server http://127.0.0.1:9067
```

## Production image

```sh
docker build -f apps/backend/Dockerfile -t zcash-node:prod .
docker compose -f docker-compose.prod.yml up
```

## Umbrel community app store

The [`umbrel-store/`](umbrel-store/) directory is a community app store package.

1. Build and publish `zcash-node:prod` (or retag the image name in `umbrel-store/zec-zcash-node/docker-compose.yml`).
2. Add the store in umbrelOS → App Store → Community App Stores.
3. Install **Zcash Node**.

## Notes

- `zcashd` reached end of life in July 2026. This app does not ship it.
- Zebra’s official images are currently **amd64**. ARM devices may need a locally built `zebrad`.
- lightwalletd is served without TLS on LAN/Tor (`--no-tls-very-insecure`), which is the usual self-hosted setup. Prefer the Tor hidden service when you are away from home.
