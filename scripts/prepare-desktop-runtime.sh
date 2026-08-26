#!/usr/bin/env bash
# Assemble the Docker-shaped app-runtime tree used by the Electron extraResources.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME="$ROOT/apps/desktop/pack/app-runtime"
BIN_DIR="$ROOT/apps/desktop/resources/bin"

echo "Compiling backend and shared libs"
(cd "$ROOT" && npx tsc -b libs/shared-types libs/settings apps/backend)

echo "Building UI"
(cd "$ROOT" && npm run --workspace apps/ui build)

echo "Fetching node binaries"
"$ROOT/scripts/fetch-node-binaries.sh"

echo "Assembling $RUNTIME"
rm -rf "$RUNTIME"
mkdir -p "$RUNTIME/apps/backend" "$RUNTIME/apps/ui" "$RUNTIME/apps/desktop"

cp "$ROOT/package.json" "$ROOT/package-lock.json" "$RUNTIME/"
cp "$ROOT/apps/backend/package.json" "$RUNTIME/apps/backend/"
cp "$ROOT/apps/ui/package.json" "$RUNTIME/apps/ui/"
cp "$ROOT/apps/desktop/package.json" "$RUNTIME/apps/desktop/"

(cd "$RUNTIME" && npm ci --omit=dev --workspace apps/backend --include-workspace-root --install-strategy=hoisted --ignore-scripts)

mkdir -p "$RUNTIME/dist/public" "$RUNTIME/libs/settings/dist" "$RUNTIME/libs/shared-types/dist"
cp -a "$ROOT/apps/backend/dist/." "$RUNTIME/dist/"
cp -a "$ROOT/apps/ui/dist/." "$RUNTIME/dist/public/"
cp -a "$ROOT/libs/settings/dist/." "$RUNTIME/libs/settings/dist/"
cp -a "$ROOT/libs/shared-types/dist/." "$RUNTIME/libs/shared-types/dist/"

test -f "$RUNTIME/dist/server.js"
test -f "$RUNTIME/dist/public/index.html"
test -f "$RUNTIME/libs/settings/dist/index.js"
test -x "$BIN_DIR/zebrad"
test -x "$BIN_DIR/zakurad"
test -x "$BIN_DIR/lightwalletd"

echo "Desktop runtime ready"
