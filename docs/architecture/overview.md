# plexus-gamma Architecture

## Overview

plexus-gamma is a plexus-rpc server that exposes UI state and dispatch as RPC methods.
A Bun HTTP/WebSocket server runs at `:44707` and serves two roles simultaneously:

- **External plexus-rpc endpoint** — any plexus client (synapse, scripts) can call methods like `ui.getView`, `ui.navigate`, `state.watch`
- **Bridge server** — the Vue app connects on `/bridge`, becoming the executor that actually runs those method calls

```
External client (synapse, etc.)
        │  plexus-rpc  ws://:44707
        ▼
  Bun server (src/server/index.ts)
        │  bridge WS  ws://:44707/bridge
        ▼
  Vue app (browser)
    useBridge.ts → useDispatch.ts → UI state
```

## Wire Format

The `@plexus/rpc` library (`plexus-rpc-ts`) defines `PlexusStreamItem` types in TypeScript
using camelCase field names (`plexusHash`, `contentType`). The Haskell/Rust plexus clients
expect snake_case on the wire (`plexus_hash`, `content_type`).

**Resolution:** `server.ts` in `@plexus/rpc` applies a `toWireItem()` transform at
serialization time. TypeScript types stay camelCase throughout; only the JSON sent over
the wire is renamed. This lives entirely inside the library — no consumer code is aware of it.

**Why not change `types.ts` to snake_case?**
hub-codegen generates TypeScript code that references `@plexus/rpc` types. Changing the
type field names would be a breaking codegen change, requiring target-level versioning in
synapse-cc and versioning support in hub-codegen — infrastructure that doesn't exist yet.
The `toWireItem()` approach fixes the interop bug without those prerequisites.

**Scope of the transform:**
Only `data` and `error` stream items carry the affected fields. `done`, `progress`, and
`request` items pass through as-is (they contain no `contentType` or `plexusHash` fields
that differ from what Haskell expects).

## Bridge Protocol

The bridge is the mechanism by which the server delegates method execution to the browser.

```
Server → Browser:
  { type: 'call',   callId, method, params }  — invoke a method
  { type: 'cancel', callId }                  — client disconnected mid-stream

Browser → Server:
  { type: 'ready' }                           — bridge connected and ready
  { type: 'item',  callId, item }             — one stream item from the method
  { type: 'done',  callId }                   — method finished
  { type: 'error', callId, message }          — method threw
```

See `src/server/bridge.ts` for type definitions and `src/server/bridge-connection.ts`
for the channel implementation and cancellation logic.

## Cancellation

When an external client disconnects mid-stream:

1. `@plexus/rpc` `server.ts` calls `iter.return()` on all active iterators for that client
2. `forwardToBridge` (bridge-connection.ts) sends `{ type: 'cancel', callId }` to the bridge WebSocket and unblocks the channel
3. `useBridge.ts` in the browser receives the cancel message, aborts the matching `AbortController`
4. The `handleCall` loop checks `ac.signal.aborted` each iteration and exits cleanly

This ensures no generator leaks when a synapse pipeline or script disconnects.

## Key Files

| File | Role |
|------|------|
| `src/server/index.ts` | Bun entry point, `serve()` call |
| `src/server/plugins.ts` | plexus-rpc plugin tree (method definitions) |
| `src/server/bridge.ts` | `BridgeCall` / `BridgeMessage` types |
| `src/server/bridge-connection.ts` | Channel, `forwardToBridge`, cancellation |
| `src/lib/useBridge.ts` | Browser-side bridge handler |
| `src/lib/useDispatch.ts` | Central UI command dispatch (all methods) |
| `src/lib/useUiState.ts` | Global reactive UI state |
