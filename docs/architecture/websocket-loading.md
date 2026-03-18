# WebSocket Loading Latency

## Why the first load feels slow

plexus-gamma must walk the full schema tree of every connected backend before it can
render anything meaningful. This walk is done over WebSocket using the same subscription
protocol used for regular calls — there is no batch or manifest endpoint. Every node in
the tree is a separate round trip.

## The load sequence

On module import, `useBackends.ts` immediately:

1. Starts polling (`pollOnce`) for each configured backend
2. Calls `refreshTree` for each backend — which drives the full schema walk

`refreshTree` calls `getCachedTree` → `buildTree`:

```
buildTree(root)
  fetchSchemaAt(root)          ← round trip 1: subscribe → ACK → data → done
  → children: [A, B, C]
  Promise.all([
    buildTree(A)               ← round trip 2 (parallel)
      fetchSchemaAt(A)
      → children: [A1, A2]
      Promise.all([
        buildTree(A1),         ← round trip 3 (parallel within A)
        buildTree(A2),
      ])
    buildTree(B),              ← round trip 2 (parallel with A)
    buildTree(C),
  ])
```

**Depth multiplies latency, not breadth.** Children at the same level are fetched
with `Promise.all` — they run in parallel. But you cannot fetch level N+1 until you
have the schema for level N (to know the children). A backend three levels deep
requires at minimum three sequential round trips regardless of how many nodes exist.

## Per-call message overhead

Each `fetchSchemaAt` call uses the plexus subscription protocol:

```
client → server:  { method: "{name}.call", params: { method: "...", params: {} } }
server → client:  { id: N, result: <subId> }         ← ACK
server → client:  { method: "subscription", params: { result: { type: "data", ... } } }
server → client:  { method: "subscription", params: { result: { type: "done" } } }
```

Four messages per schema node. Over a local loopback this is negligible, but over
a real network each round trip adds latency, and the sequential tree depth multiplies it.

## Caching

`schemaCache.ts` prevents re-fetching:

- `getCachedTree` returns the cached tree immediately on subsequent calls
- `pending` deduplicates concurrent fetches — if two components ask for the same
  backend at the same time, only one walk fires
- `invalidateTree` is called when the hash changes, forcing a fresh walk on the next
  access

The slow path is only the *first* load per backend per session (or after a schema
change). Subsequent renders are synchronous via `getCachedTreeSync`.

## The hash poller and tree refresh can race

`pollOnce` fires immediately on startup. If it detects a hash change (unlikely on
first run since `hashCurrent` is null on first poll — only sets it, doesn't refresh),
it calls `refreshTree`. Meanwhile `useBackends.ts` also calls `refreshTree` eagerly.
The `pending` map in `schemaCache` ensures both callers share the same in-flight
promise rather than issuing two parallel walks.

## Practical implications

- **Local backends (loopback)**: a three-level tree typically loads in 5–20ms total.
  The overhead is message serialization, not network.
- **Remote backends**: each level adds one network RTT. A 50ms RTT backend with
  three tree levels = ~150ms minimum before the UI can render.
- **No timeout**: `buildTree` has no timeout. If a backend is partially responsive
  (accepts connections but stalls on schema calls), the tree walk hangs indefinitely
  until the WebSocket closes.
- **Large trees**: backends with many children fan out well (parallel per level) but
  a very deep namespace hierarchy is a pathological case.

## Potential improvements (not yet implemented)

- A `{backend}.manifest` endpoint that returns the full schema tree in one call
- A timeout on `buildTree` with graceful partial-tree rendering
- Streaming the tree as nodes are fetched rather than waiting for the full walk
