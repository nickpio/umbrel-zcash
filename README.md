# Zcash Node

Run a Zcash full node on umbrelOS. The app can run [Zebra](https://zebra.zfnd.org) or [Zakura](https://zakura-core.github.io/zakura/), plus [lightwalletd](https://github.com/zcash/lightwalletd) so wallets such as Vizor, Zodl, Ywallet, and Zingo can connect to your own node.

This app is a fork of [umbrel-bitcoin](https://github.com/getumbrel/umbrel-bitcoin) with the same dashboard, insights, and settings style.

## Architecture

- **Zebra (`zebrad`) or Zakura (`zakurad`).** Consensus full node. JSON-RPC on port `8232`, P2P on `8233`. Pick one under Settings → Network. Default is Zebra 6.3.0. Zakura 1.2.0 is the other option.
- **lightwalletd.** Compact-block gRPC server on port `9067`. This is the wallet connection surface (the Electrum equivalent). It listens in plaintext by default. When a publicly trusted certificate is available (Umbrel Tailscale Let’s Encrypt, or `LIGHTWALLETD_TLS_CERT` / `LIGHTWALLETD_TLS_KEY`), it serves TLS for Vizor.
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

**Vizor** requires `https://` and verifies the certificate against Mozilla’s webpki roots (not the OS trust store). Self-signed certs fail.

### Vizor over Umbrel Tailscale

1. Install and log into the Umbrel **Tailscale** app.
2. In the [Tailscale admin console](https://login.tailscale.com/admin/dns), enable **MagicDNS** and **HTTPS Certificates**.
3. Restart this Zcash Node app. On start it fetches a Let’s Encrypt cert for your MagicDNS name and lightwalletd presents it on port `9067`.
4. Open **Connect → Wallet → Tailscale** and paste `https://<machine>.<tailnet>.ts.net:9067` into Vizor.

Clients must be on your tailnet. Restart the app periodically (or after ~60 days) so the cert renews. Alternatively set `LIGHTWALLETD_TLS_CERT` and `LIGHTWALLETD_TLS_KEY` to any publicly trusted PEM pair.

## Production image

```sh
docker build -f apps/backend/Dockerfile -t zcash-node:prod .
docker compose -f docker-compose.prod.yml up
```

## Desktop (Linux x64)

Tagged releases attach an AppImage, `.deb`, and `.tar.gz` for machines that are not running umbrelOS. They bundle the UI, the Fastify supervisor, `zebrad` 6.3.0, `zakurad` 1.2.0, and `lightwalletd` v0.5.0.

Requirements: **glibc 2.34+** (Ubuntu 22.04, Debian 12, current Fedora/Arch). The AppImage does not bundle glibc.

```sh
chmod +x zcash-node-*-linux-*.AppImage
./zcash-node-*-linux-*.AppImage
```

Or install the `.deb` and run `zcash-node`. The window loads the dashboard at `http://127.0.0.1:<port>/` (port `3000`, or the next free port).

First-run state is stored under `~/.local/share/zcash-node` (`zebra`, `zakura`, `app`, `lightwalletd`). Override with `ZCASH_NODE_DATA`. Desktop defaults to **Mainnet**. A full sync needs a lot of disk and bandwidth; do not start this on a small disk.

The dashboard binds localhost only. Node P2P (`8233`) and lightwalletd (`9067`) still listen on all interfaces so wallets on the LAN can connect. RPC stays on `8232`.

Headless (home server / systemd), then open the printed localhost URL in a browser:

```sh
./zcash-node-*-linux-*.AppImage --headless
# or: zcash-node --headless
```

```ini
# /etc/systemd/system/zcash-node.service
[Unit]
Description=Zcash Node
After=network-online.target

[Service]
Type=simple
User=zcash
ExecStart=/opt/Zcash Node/zcash-node --headless
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Adjust `ExecStart` to the AppImage path or the unpacked `tar.gz` binary. If FUSE is unavailable, extract the AppImage with `--appimage-extract-and-run`.

To build locally:

```sh
npm ci
npm run desktop:build
```

That writes packages under `apps/desktop/release/`. `npm run desktop:dev` opens Electron against `npm run dev` (`http://localhost:5173`) and does not embed the node binaries.

## Notes

- `zcashd` reached end of life in July 2026. This app does not ship it.
- Zebra's official images are currently **amd64**. ARM devices may need a locally built `zebrad`.
- Zakura 1.2.0 publishes amd64 and arm64 images. The app image still copies Zebra from an amd64-only tag, so a multi-arch build is not automatic.
- lightwalletd is plaintext on LAN and Tor unless a trusted TLS cert is configured. Prefer Tor only for wallets that accept `http://`. While a Tailscale cert is active, Vizor must use the MagicDNS https:// URI (LAN/Tor hostnames will fail certificate checks).
