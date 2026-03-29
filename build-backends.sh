#!/usr/bin/env bash
set -euo pipefail

# Build Rust backends from sibling directories.
# Run from the plexus-gamma directory.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "[build-backends] Building plexus-substrate..."
cargo build --manifest-path ../plexus-substrate/Cargo.toml

echo "[build-backends] Building fidget-spinner..."
cargo build --manifest-path ../fidget-spinner/Cargo.toml

echo "[build-backends] Done."
