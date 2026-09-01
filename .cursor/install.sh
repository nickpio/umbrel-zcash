#!/usr/bin/env bash
# Cloud Agent install script for the Zcash Node app.
# Idempotent: refreshes JS deps, builds the shared libs the backend imports,
# and ensures the external node binaries the backend shells out to are present.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# 1. JS workspaces (UI + backend).
npm ci

# 2. Build shared libs + backend. The backend resolves `#settings` to
#    libs/settings/dist at runtime, so these must be compiled before `npm run dev`.
npx tsc -b libs/shared-types libs/settings apps/backend

# 3. External node binaries. These are NOT npm deps; the production image bakes
#    them from upstream Docker images, but that path needs Docker. Fetch/build
#    them here instead. Skip when already present so re-runs stay fast.
BIN_DIR="$HOME/bin"
mkdir -p "$BIN_DIR"

if [ ! -x "$BIN_DIR/zebrad" ]; then
	echo "Fetching zebrad 6.3.0 (prebuilt linux-gnu binary)…"
	curl -fsSL https://github.com/ZcashFoundation/zebra/releases/download/v6.3.0/zebrad-6.3.0-x86_64-unknown-linux-gnu.tar.gz \
		| tar -xz -C "$BIN_DIR" zebrad
fi

if [ ! -x "$BIN_DIR/lightwalletd" ]; then
	echo "Building lightwalletd v0.5.0 from source (no upstream binary release)…"
	tmp="$(mktemp -d)"
	git clone --depth 1 --branch v0.5.0 https://github.com/zcash/lightwalletd.git "$tmp"
	(cd "$tmp" && make)
	cp "$tmp/lightwalletd" "$BIN_DIR/"
	rm -rf "$tmp"
fi

echo "install complete: $("$BIN_DIR/zebrad" --version), $("$BIN_DIR/lightwalletd" version 2>&1 | head -1)"
