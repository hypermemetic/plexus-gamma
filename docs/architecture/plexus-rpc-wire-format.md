# plexus-rpc Wire Format: camelCase Types, snake_case Wire

## The two distinct naming problems

There are two separate camelCase/snake_case boundaries in the plexus stack. It is
important not to conflate them:

**1. Client-side params/response data** (documented in `camelcase-ingress-snakecase-egress.md`)
— `transformKeys` converts incoming response data to camelCase; `keysToSnake` converts
outgoing params back to snake_case before sending.

**2. Server-side stream item envelope** (this document)
— The `@plexus/rpc` library's `PlexusStreamItem` TypeScript types use camelCase
(`plexusHash`, `contentType`), but the Haskell/Rust clients expect snake_case on the
wire (`plexus_hash`, `content_type`). This is a serialization mismatch in the library
itself, not in application code.

## The mismatch

`plexus-rpc-ts/src/types.ts` defines stream item types using camelCase:

```ts
interface StreamMetadata       { plexusHash: string; ... }
interface PlexusStreamItemData { contentType: string; ... }
```

`JSON.stringify` serializes these with their TypeScript property names, so any server
built on `@plexus/rpc` emits:

```json
{ "type": "data", "metadata": { "plexusHash": "..." }, "contentType": "..." }
```

The Haskell `plexus-protocol` library deserializes with Aeson's snake_case convention
and expects:

```json
{ "type": "data", "metadata": { "plexus_hash": "..." }, "content_type": "..." }
```

Result: synapse can connect and subscribe, but cannot decode any `data` response — the
`content_type` and `plexus_hash` fields are simply missing from the parsed struct.

## The fix: `toWireItem()` in server.ts

`plexus-rpc-ts/src/server.ts` applies a transform at serialization time. TypeScript
types stay camelCase throughout; only the JSON written to the wire is renamed:

```ts
function toWireItem(item: PlexusStreamItem): unknown {
  if (item.type === 'data') {
    return {
      type: 'data',
      metadata: { provenance: ..., plexus_hash: item.metadata.plexusHash, timestamp: ... },
      content_type: item.contentType,
      content: item.content,
    }
  }
  if (item.type === 'error') { ... }  // same pattern
  return item  // done / progress / request pass through as-is
}
```

`sendNotif` now serializes `toWireItem(item)` instead of `item` directly.

Only `data` and `error` items carry the affected fields. `done`, `progress`, and
`request` pass through unchanged (Haskell doesn't inspect their metadata).

## Why not just change `types.ts` to snake_case?

This was discussed and rejected — it is not a simple rename:

**hub-codegen generates TypeScript code** that references `@plexus/rpc` types. Changing
field names in the library would break all generated code (transport.ts, rpc.ts). That
is a semver-breaking codegen change.

Handling it correctly requires:
- **Target-level versioning** in synapse-cc (different targets can pin different
  `@plexus/rpc` versions)
- **Version-aware code generation** in hub-codegen (emit compatible field names per
  library version)

Neither exists yet. The `toWireItem()` approach fixes the interop bug without those
prerequisites. The architectural cleanup can happen once versioning infrastructure is in
place.

## The boundary contract

```
TypeScript internals       @plexus/rpc server.ts          Wire / Haskell
──────────────────         ─────────────────────          ──────────────
item.metadata.plexusHash   toWireItem()   →   plexus_hash
item.contentType                          →   content_type
item.type                                →   type          (unchanged)
item.content                             →   content       (unchanged)
```

The browser client (`transport.ts`) only inspects `item.type`, never `contentType` or
`plexusHash` on the wrapper, so it is unaffected by this transform.
