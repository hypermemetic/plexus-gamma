#!/usr/bin/env bash
set -euo pipefail

SUBSTRATE_BIN="/src/plexus-substrate/target/debug/plexus-substrate"
SUBSTRATE_PORT="${SUBSTRATE_PORT:-4444}"

# ── Start plexus-substrate in the background ──────────────────────────────
if [ -x "$SUBSTRATE_BIN" ]; then
  echo "[entrypoint] starting plexus-substrate on port $SUBSTRATE_PORT"
  "$SUBSTRATE_BIN" --port "$SUBSTRATE_PORT" &
  SUBSTRATE_PID=$!

  # Wait for the WebSocket port to open (max 10s)
  for i in $(seq 1 20); do
    if bash -c "echo > /dev/tcp/127.0.0.1/$SUBSTRATE_PORT" 2>/dev/null; then
      echo "[entrypoint] substrate ready"
      break
    fi
    sleep 0.5
  done
else
  echo "[entrypoint] WARNING: substrate binary not found at $SUBSTRATE_BIN — tests may fail"
fi

# ── Run the requested command ──────────────────────────────────────────────
exec "$@"
