# Zcash Node

Run a Zcash full node on umbrelOS. The app can run [Zebra](https://zebra.zfnd.org) or [Zakura](https://zakura-core.github.io/zakura/), plus [lightwalletd](https://github.com/zcash/lightwalletd) so wallets such as Vizor, Zodl, Ywallet, and Zingo can connect to your own node.

This app is a fork of [umbrel-bitcoin](https://github.com/getumbrel/umbrel-bitcoin) with the same dashboard, insights, and settings style.

## Architecture

- **Zebra (`zebrad`) or Zakura (`zakurad`).** Consensus full node. JSON-RPC on port `8232`, P2P on `8233`. Pick one under Settings → Network. Default is Zebra 6.3.0. Zakura 1.2.0 is the other option.
- **lightwalletd.** Compact-block gRPC server on port `9067`. This is the wallet connection surface (the Electrum equivalent). It listens in plaintext by default so a TLS terminator with a publicly trusted certificate can sit in front.
- **App UI.** React dashboard served by a Fastify backend that manages the selected node and lightwalletd.

Both binaries ship in the production image. Only one node runs at a time. Wallets keep talking to lightwalletd on `9067` either way.

Zakura is a Zebra fork, so the generated TOML, RPC, and P2P layout stay the same. This app runs standalone `zakurad` only. It does not start Zakura's optional zcashd-compat sidecar.

## Switching implementations

Settings → Network → Node Implementation. Saving restarts the node and lightwalletd.

Zebra stores chain state in `/data/zebra`. Zakura uses `/data/zakura`. Switching empties the unused directory so only one chain sits on disk. The new node then syncs from scratch. That can take a long time and a lot of bandwidth. The save dialog warns you before it happens.

## Development

```sh
docker compose up --build
```

The UI is at `http://localhost:5173`. Dev defaults to **Testnet**.

Connect a light wallet once the node has some blocks and lightwalletd is running.

Zodl, Ywallet, and Zingo can use the plaintext URI:

```sh
zingo-cli --server http://127.0.0.1:9067
```

**Vizor** (and Zashi) will not connect to this URI. Release Vizor requires `https://` and verifies the certificate against Mozilla’s webpki roots, not the OS trust store. A self-signed cert, mkcert, or a CA you install on the machine all fail. HTTP is accepted only for `localhost` in Vizor debug builds.

Use **Connect → Wallet → Vizor HTTPS → Enable**. The app starts Tailscale in userspace, asks you to log in, mints a Let’s Encrypt certificate for `*.ts.net`, and puts Caddy in front of plaintext lightwalletd over HTTP/2. Paste the `hostname.ts.net:443` value into Vizor. Vizor’s network (mainnet vs testnet) must match this node.

If Funnel is enabled on the tailnet, Vizor can reach that URL from the public internet. Otherwise the URL is tailnet-only and the phone also needs Tailscale. Optional `TS_AUTHKEY` skips the interactive login. Enable HTTPS Certificates in the Tailscale admin console.

Alternatively, put Caddy, nginx, or certbot in front with a Let’s Encrypt certificate on a public hostname. To make lightwalletd itself speak TLS, set `LIGHTWALLETD_TLS_CERT` and `LIGHTWALLETD_TLS_KEY` to a publicly trusted PEM pair.

## Production image

```sh
docker build -f apps/backend/Dockerfile -t zcash-node:prod .
docker compose -f docker-compose.prod.yml up
```

## Notes

- `zcashd` reached end of life in July 2026. This app does not ship it.
- Zebra's official images are currently **amd64**. ARM devices may need a locally built `zebrad`.
- Zakura 1.2.0 publishes amd64 and arm64 images. The app image still copies Zebra from an amd64-only tag, so a multi-arch build is not automatic.
- lightwalletd listens in plaintext on LAN and Tor by default. Release Vizor needs the in-app Vizor HTTPS front (or another publicly trusted HTTPS terminator). Prefer the Tor hidden service only for wallets that accept `http://`.
- If the Umbrel Tailscale app is installed and MagicDNS + HTTPS Certificates are enabled on the tailnet, app start fetches a Let’s Encrypt cert into `data/lightwalletd/tls/` and lightwalletd can present it on port `9067` (same as setting `LIGHTWALLETD_TLS_CERT` / `LIGHTWALLETD_TLS_KEY`). Restart the app to renew (certs last ~90 days).
