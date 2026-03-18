# TypeScript plexus-rpc Server: Synapse Interop Issues

Working log of bugs found and fixed when connecting `synapse -P 44707 plexus-gamma` to
the `@plexus/rpc` TypeScript server.

---

## Issue 1: `content_type` / `plexus_hash` camelCase on wire

### What I saw
`synapse` could connect and subscribe but Haskell failed to decode any `StreamData`
responses. The fields `contentType` and `plexusHash` (TypeScript camelCase) were on
the wire but Haskell's Aeson decoders expected `content_type` and `plexus_hash`.

### What I found
`server.ts` serialized `PlexusStreamItem` objects directly with `JSON.stringify`, which
uses the TypeScript property names. The Haskell `plexus-protocol` library uses
snake_case Aeson field names everywhere.

### Fix
Added `toWireItem()` in `server.ts` that maps camelCase TypeScript fields to
snake_case for the wire format. TypeScript interfaces remain camelCase internally.
Originally only `data` and `error` items were handled; expanded to cover `done` and
`progress` as well (all item types that carry `metadata`).

---

## Issue 2: `_info` direct response vs subscription protocol

### What I saw
`synapse -P 44707 plexus-gamma` hung immediately. `strace` showed synapse connected,
received the `_info` response, then sent nothing further.

### What I found
The Haskell `discoverBackendName` calls `ST.rpcCallWith cfg "_info" Aeson.Null`. This
uses `substrateRpc` — the subscription protocol — for **all** calls, including `_info`.
It expects: ACK with numeric subId → stream data items → stream done.

Our `server.ts` had a special case that returned `_info` as a **direct** JSON-RPC
response: `{ "id": N, "result": { "backend": "...", "version": "..." } }`.

Haskell received this and tried to parse `result` as a `SubscriptionId`. Since
`SubscriptionId.fromJSON` never fails (it encodes the raw JSON as a string), it
"succeeded" with `SubscriptionId "{\"backend\":\"plexus-gamma\",...}"`. It then
registered a subscription queue under that impossible ID and waited forever for
notifications that would never arrive.

### Fix
Changed the `_info` handler to use the subscription protocol: send ACK with a real
numeric subId, then dispatch to `handleInner` which emits `data` + `done` normally.

---

## Issue 3: Float timestamp rejected by Haskell's `Integer` decoder

### What I saw
After fixing issues 1 and 2, synapse still hung. The `_info` call now went through
the subscription protocol but synapse still sent only one message then stopped.

### What I found
The `meta()` function used `Date.now() / 1000` for the timestamp, producing a float
like `1773801011.821`. The Haskell `StreamMetadata` type has `metaTimestamp :: Integer`.

Aeson's `FromJSON Integer` uses `floatingOrInteger` which returns `Left Double` for
numbers with fractional parts — a parse failure. The metadata parse fails silently
in `streamItems`, which prints "Failed to parse stream item" to stderr and loops
forever waiting for a `StreamDone` that was already sent.

### Fix
Changed `meta()` to `Math.floor(Date.now() / 1000)` — integer Unix epoch seconds.

---

## Issue 4: Relative namespace paths in schema/hash lookups

### What I saw
`synapse -j -P 44707 plexus-gamma ui` failed with:
```
Fetch error at ui: Protocol error: Unknown namespace: ui
```

### What I found
Synapse's `fetchSchemaAt` builds the method name from the path segment directly:
`"ui.schema"` (not `"plexus-gamma.ui.schema"`). Our `schemas` map is keyed by full
namespaces: `"plexus-gamma"`, `"plexus-gamma.ui"`, `"plexus-gamma.state"`, etc.

So `schemas.get("ui")` returns `undefined` even though `schemas.get("plexus-gamma.ui")`
would succeed.

### Fix
Added fallback lookup with backend prefix in the schema and hash handlers:
```ts
const schema = schemas.get(ns) ?? schemas.get(`${name}.${ns}`)
```
This handles any depth of nesting since synapse always sends the path relative to
the root (e.g., `"state.watch.schema"` would resolve to `"plexus-gamma.state.watch"`).

---

## Final state

After all four fixes, `synapse -P 44707 plexus-gamma` lists the schema. Navigation
to child namespaces works: `synapse -j -P 44707 plexus-gamma ui` shows all UI methods.

The remaining issue is that `synapse -P 44707 plexus-gamma` (without `-j`) crashes on
startup with `commitAndReleaseBuffer: invalid argument (cannot encode character '\9608')`
because the splash screen uses Unicode block characters (█) and the shell locale is
not UTF-8. This is a display issue in the synapse CLI, not a protocol issue.

Method execution of UI methods (`ui.getView`, `ui.navigate`, etc.) requires the Vue
app to be connected to the `/bridge` WebSocket. Without the browser, those calls return
a "Bridge not connected" error, which is expected behavior.
