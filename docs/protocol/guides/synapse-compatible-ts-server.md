# Writing a Synapse-Compatible TypeScript plexus-rpc Server

A guide for implementing a server that the Haskell `synapse` CLI and
`plexus-protocol` library can connect to, explore, and invoke methods on.

The `@plexus/rpc` library (`plexus-rpc-ts`) encodes all of this so you
normally don't have to think about it. Read this document if you are
debugging interop failures, implementing an alternative server, or
extending the library.

---

## 1. The protocol is not standard JSON-RPC 2.0

Standard JSON-RPC 2.0 has one-to-one request/response semantics.
The plexus protocol is a **subscription pattern**:

```
client  →  { "jsonrpc":"2.0", "id":1, "method":"backend.call",
              "params":{"method":"foo","params":{}} }

server  →  { "jsonrpc":"2.0", "id":1, "result": 42 }           ← ACK: subId=42

server  →  { "jsonrpc":"2.0", "method":"subscription",
              "params":{"subscription":42, "result":{"type":"data",...}} }  ← item 1

server  →  { "jsonrpc":"2.0", "method":"subscription",
              "params":{"subscription":42, "result":{"type":"done",...}} }   ← end
```

One client request maps to zero-or-more data items plus a final `done`
or `error`. This is the Ethereum `eth_subscribe` pattern.

**All** calls use this pattern — including introspection (`_info`, `.schema`,
`.hash`). There is no direct response path.

---

## 2. `_info` must use the subscription protocol

Haskell's `discoverBackendName` calls `_info` via `substrateRpc` — the
subscription client — not as a direct JSON-RPC call.

```
client  →  { "jsonrpc":"2.0", "id":1, "method":"_info", "params":null }
server  →  { "jsonrpc":"2.0", "id":1, "result": <subId> }    ← ACK
server  →  subscription data: { "backend":"my-backend", "version":"0.1.0" }
server  →  subscription done
```

If the server returns `_info` as a direct `{ "id":1, "result":{...} }` response
(as standard JSON-RPC would), the Haskell client parses `result` as a
`SubscriptionId`. `SubscriptionId.fromJSON` **never fails** — it encodes the
entire JSON object as a string. The client then registers a subscription
queue under that garbage ID and waits forever for notifications that never arrive.

**The `@plexus/rpc` library handles this correctly.** It catches the `_info`
method before the generic call handler and dispatches it through `handleInner`.

---

## 3. Wire format: snake_case, not camelCase

TypeScript naturally uses camelCase. Haskell's Aeson uses snake_case by
convention. The wire format must use snake_case:

| TypeScript internal   | Wire (JSON)       |
|-----------------------|-------------------|
| `metadata.plexusHash` | `plexus_hash`     |
| `contentType`         | `content_type`    |
| `type`, `content`, `provenance`, `timestamp` | unchanged |

**This applies to all stream item types** that carry metadata — `data`,
`error`, `progress`, and `done`. If only `data` and `error` are transformed,
`done` items will fail to parse in Haskell (Aeson rejects the missing
`plexus_hash` field).

The `@plexus/rpc` library handles this via `toWireItem()` in `server.ts`.
TypeScript interfaces stay camelCase internally.

---

## 4. Timestamp must be an integer

`StreamMetadata` has `metaTimestamp :: Integer` in Haskell.

Aeson's `FromJSON Integer` uses `floatingOrInteger`:
- Integer JSON number → `Right Integer` — OK
- Float JSON number (e.g. `1773801011.821`) → `Left Double` — **parse failure**

The failure is **silent**: Haskell prints `"Failed to parse stream item"` to
stderr and loops forever waiting for a `StreamDone` that was already sent.

```ts
// Wrong:
timestamp: Date.now() / 1000          // → 1773801011.821  (float)

// Correct:
timestamp: Math.floor(Date.now() / 1000)  // → 1773801011  (integer)
```

---

## 5. Namespace paths are relative

Synapse calls schema and hash lookups with **relative** method names:

```
plexus-gamma.call  →  { method: "ui.schema" }       ← NOT "plexus-gamma.ui.schema"
plexus-gamma.call  →  { method: "state.hash" }      ← NOT "plexus-gamma.state.hash"
plexus-gamma.call  →  { method: "ui.navigate" }     ← NOT "plexus-gamma.ui.navigate"
```

But the server's internal schema and method maps use fully-qualified keys
(e.g. `"plexus-gamma.ui"`). A direct `map.get("ui")` will always miss.

**Fix**: try the relative key first, then fall back with the backend prefix:

```ts
const schema = schemas.get(ns) ?? schemas.get(`${name}.${ns}`)
const method = methods.get(m)  ?? methods.get(`${name}.${m}`)
```

---

## 6. Schema introspection endpoints

Synapse walks the schema tree before executing any method. The server must
handle three built-in methods:

| Method pattern   | Params                  | Returns               |
|------------------|-------------------------|-----------------------|
| `{ns}.schema`    | `{}` (or `{method: x}`) | `PluginSchema` JSON   |
| `{ns}.hash`      | `{}`                    | `{"event":"hash","value":"<hex16>"}` |
| `_info`          | any                     | `{"backend":"<name>","version":"<ver>"}` |

The hash is a 16-character lowercase hex string (SHA-256 of the schema
content, first 8 bytes). It changes whenever any method or child schema changes.

---

## 7. Complete message flow for a method call

```
1. synapse  →  server:
     { "jsonrpc":"2.0", "id":1, "method":"plexus-gamma.call",
       "params":{"method":"ui.navigate","params":{"view":"canvas"}} }

2. server   →  synapse:
     { "jsonrpc":"2.0", "id":1, "result":42 }   ← subId ACK

3. server   →  synapse (data item):
     { "jsonrpc":"2.0", "method":"subscription",
       "params":{"subscription":42,"result":{
         "type":"data",
         "metadata":{"provenance":["plexus-gamma"],"plexus_hash":"abc…","timestamp":1773801011},
         "content_type":"plexus-gamma.result",
         "content":{"ok":true}
       }}}

4. server   →  synapse (done):
     { "jsonrpc":"2.0", "method":"subscription",
       "params":{"subscription":42,"result":{
         "type":"done",
         "metadata":{"provenance":["plexus-gamma"],"plexus_hash":"abc…","timestamp":1773801011}
       }}}
```

---

## 8. Connection pool and multiple backends

`Plexus.Transport` keeps a global connection pool keyed by `SubstrateConfig`.
Each unique `(host, port, backend)` combination gets its own pool. When synapse
explores `plexus-gamma.ui`, it uses a config with `substrateBackend = "plexus-gamma"`
regardless of which sub-namespace it is querying.

There is no per-namespace connection — all calls for one backend share the same
WebSocket connection (multiplexed via subscription IDs).

---

## 9. What `@plexus/rpc` handles automatically

Using `serve()` from `@plexus/rpc` gives you all of the above for free:

- Subscription protocol framing (ACK + notifications + done)
- `_info` via subscription (not direct response)
- `toWireItem()` snake_case transform for all metadata-carrying item types
- Integer timestamp (`Math.floor(Date.now() / 1000)`)
- Relative namespace fallback for `.schema`, `.hash`, and method calls
- Schema and hash generation from `plugin()` + `method()` definitions
- TypeBox parameter validation with defaults

What you still need to implement yourself:

- The bridge pattern (if your server proxies calls to a separate process/browser)
- Streaming generators (use `async *run(params) { yield item }`)
- Error handling within method implementations

---

## 10. Testing synapse compatibility

The canonical test is:

```
synapse -j -P <port> <backend>              # discovers backend, lists root schema
synapse -j -P <port> <backend> <namespace>  # walks into child namespace
synapse -j -P <port> <backend> <method> --param value  # invokes a method
```

All three must work before considering the server synapse-compatible.

The `tests/rpc-integration.spec.ts` Playwright suite exercises the same
protocol path programmatically — WebSocket subscription calls from Node.js
verified against live DOM state in a headless browser.

### Known failure modes

| Symptom                                    | Cause                              | Fix                                  |
|--------------------------------------------|------------------------------------|--------------------------------------|
| synapse hangs after connect                | `_info` returned as direct response | Use subscription protocol for `_info` |
| synapse hangs after `_info` succeeds       | Float timestamp in metadata        | `Math.floor(Date.now() / 1000)`      |
| `Unknown namespace: ui`                    | Relative vs full path mismatch     | Fallback lookup with backend prefix  |
| `Method not found: ui.navigate`            | Same as above, for method calls    | Same fallback                        |
| Haskell can't decode `StreamData`          | camelCase fields on wire           | `toWireItem()` snake_case transform  |
| splash screen crashes with Unicode error   | Terminal locale is not UTF-8       | Not a protocol issue; use `-j` flag  |
