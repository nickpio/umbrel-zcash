#!/usr/bin/env bash
# Download/build the Linux x64 node binaries shipped in the desktop package.
# Versions match apps/backend/Dockerfile.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="${DEST:-$ROOT/apps/desktop/resources/bin}"
CACHE="${CACHE:-$ROOT/apps/desktop/resources/.cache}"

ZEBRA_VERSION="${ZEBRA_VERSION:-6.3.0}"
ZAKURA_VERSION="${ZAKURA_VERSION:-v1.2.0}"
LIGHTWALLETD_VERSION="${LIGHTWALLETD_VERSION:-v0.5.0}"

ZEBRA_TAR="zebrad-${ZEBRA_VERSION}-x86_64-unknown-linux-gnu.tar.gz"
ZEBRA_URL="https://github.com/ZcashFoundation/zebra/releases/download/v${ZEBRA_VERSION}/${ZEBRA_TAR}"
ZEBRA_SHA256="${ZEBRA_SHA256:-86326f5324f4e59cc2008c15f94407cc8d5feacf75d64942164bb5f08eca8c5e}"

ZAKURA_TAR="zakurad-${ZAKURA_VERSION}-linux-x86_64.tar.gz"
ZAKURA_URL="https://github.com/zakura-core/zakura/releases/download/${ZAKURA_VERSION}/${ZAKURA_TAR}"
ZAKURA_SHA256="${ZAKURA_SHA256:-b2697cea3fa43e8ba7c832f9ad0fa4a2804f03e3155b86864f44f1b8a7938b36}"

mkdir -p "$DEST" "$CACHE"

need() {
	local name="$1"
	if [[ -x "$DEST/$name" && "${FORCE_FETCH:-}" != "1" ]]; then
		echo "Using existing $DEST/$name"
		return 1
	fi
	return 0
}

verify_sha256() {
	local file="$1"
	local expected="$2"
	local actual
	actual="$(sha256sum "$file" | awk '{print $1}')"
	if [[ "$actual" != "$expected" ]]; then
		echo "SHA256 mismatch for $(basename "$file")" >&2
		echo "  expected: $expected" >&2
		echo "  actual:   $actual" >&2
		exit 1
	fi
}

extract_named_binary() {
	local archive="$1"
	local name="$2"
	local tmp
	tmp="$(mktemp -d)"
	tar -xzf "$archive" -C "$tmp"
	local found
	found="$(find "$tmp" -type f -name "$name" | head -n 1)"
	if [[ -z "$found" ]]; then
		echo "Could not find $name inside $archive" >&2
		exit 1
	fi
	cp "$found" "$DEST/$name"
	chmod +x "$DEST/$name"
	rm -rf "$tmp"
}

if need zebrad; then
	echo "Fetching $ZEBRA_TAR"
	curl -fsSL -o "$CACHE/$ZEBRA_TAR" "$ZEBRA_URL"
	verify_sha256 "$CACHE/$ZEBRA_TAR" "$ZEBRA_SHA256"
	extract_named_binary "$CACHE/$ZEBRA_TAR" zebrad
fi

if need zakurad; then
	echo "Fetching $ZAKURA_TAR"
	curl -fsSL -o "$CACHE/$ZAKURA_TAR" "$ZAKURA_URL"
	verify_sha256 "$CACHE/$ZAKURA_TAR" "$ZAKURA_SHA256"
	extract_named_binary "$CACHE/$ZAKURA_TAR" zakurad
fi

if need lightwalletd; then
	echo "Building lightwalletd ${LIGHTWALLETD_VERSION} from source"
	if ! command -v go >/dev/null 2>&1; then
		echo "Go is required to build lightwalletd" >&2
		exit 1
	fi
	rm -rf "$CACHE/lightwalletd"
	git clone --depth 1 --branch "$LIGHTWALLETD_VERSION" https://github.com/zcash/lightwalletd.git "$CACHE/lightwalletd"
	make -C "$CACHE/lightwalletd"
	cp "$CACHE/lightwalletd/lightwalletd" "$DEST/lightwalletd"
	chmod +x "$DEST/lightwalletd"
fi

echo "Node binaries ready in $DEST"
ls -l "$DEST/zebrad" "$DEST/zakurad" "$DEST/lightwalletd"
