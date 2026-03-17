# plexus-gamma

**Swagger UI for your microservices — but generated at runtime from live schema, not a YAML file.**

### explore — live schema browser

![Explorer view](docs/screenshots/01-explorer.png)

**Header bar** — connected backends appear as pill badges with live latency readouts (`substrate 77ms`, `fidget-spinner 74ms`). The `+` button adds a new WebSocket connection. The schema hash (`4693a5d`) reflects the current content fingerprint of the connected service; it changes automatically when any plugin or method changes. View tabs on the right switch between all five views.

**Left sidebar** — a collapsible tree of every plugin on every connected backend. `SUBSTRATE` is expanded, showing 12 plugins: top-level leaves (`cone`, `arbor`, `bash`, `changelog`) and the `solar` hub (8 planet sub-plugins). `FIDGET-SPINNER` is a second backend with one plugin. Clicking any node selects it and loads its detail on the right.

**Detail pane** — the selected `echo` plugin. The header shows its version (`v1.0.0`), short hash (`15cc3045`), and whether it is a `leaf` (no children) or a `hub`. The description is rendered directly from the live schema — no separate docs file. Each method (`echo`, `once`, `ping`, …) gets its own invocation card: a schema-driven param form, a `▶ invoke` button that streams results back in real time, a collapsible `RETURNS` schema block, and optional `Batch` and `Tests` panels for running the method at scale or asserting on its output.

---

### topology — visual backend graph

![Topology view](docs/screenshots/02-topology.png)

**Canvas** — each backend is laid out as a tree of plugin nodes. Dots inside each node represent methods — the more dots, the richer the plugin. Hub nodes (like `solar`, `earth`, `jupiter`) branch outward to their children, so the full namespace hierarchy is visible at a glance without clicking into anything.

**SUBSTRATE** (left) shows the complete plugin tree: top-level plugins along the left column, `solar` branching right into the planetary plugins, and those branching further into moons (`luna`, `phobos`, `deimos` under `earth`; `io`, `europa`, `ganymede`, `callisto` under `jupiter`; etc.). **FIDGET-SPINNER** (right) is a separate backend with a single `fidget` plugin.

**Interaction** — drag to pan, scroll to zoom, click a node to navigate to it in the explorer. The toolbar (top-right) offers fit-to-view, reset, and a toggle between node-card and dot-only rendering.

---

### sheet — full-width overview

![Sheet view](docs/screenshots/03-sheet.png)

**Tree** — all backends are listed full-width as an indented outline. This gives the fastest overview of everything connected: `SUBSTRATE` with 12 plugins (including the `solar` hub and its 8 children), and `FIDGET-SPINNER` with 1. No columns to scroll past, no sidebar to juggle.

**Slide-up panel** — clicking any plugin slides a detail sheet up from the bottom. Here the `cone` plugin is open (`substrate › cone`). The panel shows the plugin description ("LLM cone with persistent conversation context") and a compact method list: `create`, `get`, `list`, `delete`, `chat` (marked `STREAM` — it yields tokens incrementally), and `set_head`. Clicking a method expands an inline invocation form. The panel can be dragged to any height or dismissed with `×`.

---

### wiring — visual pipeline builder

![Wiring view](docs/screenshots/04-wiring.png)

**Toolbar** — `+ Method` drags a new method node onto the canvas. `▶ Run` executes the entire pipeline left-to-right in one click. Additional controls: `Export JSON` / `Import` for saving and loading pipelines, `Auto Layout` to re-arrange nodes, `Snapshot` and `Preview` for output inspection, and full undo/redo.

**Left sidebar** — a search box filters methods across all connected backends. Below it, collapsible backend trees (`substrate ›`, `fidget-spinner ›`) let you browse and drag methods directly onto the canvas. The `TRANSFORMS` palette adds data-manipulation nodes (`Extract`, `Template`, `Merge`, `Script`) that are not RPC calls but operate on the pipeline's in-flight data. The `UI` palette adds layout primitives (`Row`, `Col`, `Text`, `Input`, `Btn`, `Slider`, `Table`) for building interactive output panels.

**Canvas** — this pipeline runs a shell command, transforms its output, then runs a second command with the result. Node 1 (`bash.execute`) runs `printf 'hello plexus'` and produces `[{line:"hello plexus",type:"stdout"},{code:0,type:"exit"}]`. A bezier edge labelled `1st` wires its output into Node 2 (`template`), which uses `{{slot0.line}}` interpolation to construct `echo "hello plexus" | tr a-z A-Z`. That output is wired through a transform node into Node 3 (`bash.execute`), which runs the rendered command and returns `HELLO PLEXUS`. Each node shows its live result inline after execution.

---

## What is it?

plexus-gamma is a browser-based explorer for services that speak
[plexus-rpc](https://github.com/hypermemetic/plexus) — a JSON-RPC 2.0 protocol over
WebSocket where every service self-describes its API at runtime.

**It works like Swagger UI, but:**

| Swagger UI | plexus-gamma |
|---|---|
| Reads a static `openapi.yaml` committed to the repo | Fetches live schema from the running service at startup |
| Needs a rebuild when the API changes | Auto-refreshes when the service schema hash changes |
| Knows about one service at a time | Connects to multiple backends simultaneously |
| Can't actually run streaming RPC calls | Streams results in real time, renders line by line |
| API changes require updating docs | Zero docs — the service is its own documentation |

**New microservices integrate with zero code changes.** Point plexus-gamma at a new
`ws://host:port` and it immediately discovers every plugin, namespace, method, parameter
schema, and description from the live service. No config files, no code generation, no
restarts.

---

## Views

| Tab | What it does |
|-----|--------------|
| **explore** | Schema browser — sidebar tree of all plugins, detail pane with live-invokable method forms and streaming results. |
| **topology** | Canvas graph of every plugin and its methods as dots; drag/zoom to compare backend structures. |
| **sheet** | Full-width plugin outline; click any node to slide up a detail sheet with the method list. |
| **wiring** | Visual pipeline builder — connect method outputs to inputs, add transform nodes, run the whole pipeline in one click. |
| **orchestrate** | Workflow editor for sequencing steps with branching logic and reusable workflow definitions. |

---

## The plexus-rpc schema system

Every plexus-rpc service exposes a **self-describing, hierarchical schema** — no external
registry or service mesh required.

```
ws://host:port
  ├─ service.schema()     → root namespace schema
  ├─ service.hash()       → content hash of the whole schema tree
  ├─ plugin.schema()      → child namespace schema
  └─ plugin.method()      → actual RPC call (streaming)
```

A schema node describes:
- **namespace** — dot-namespaced identifier (`echo`, `solar.earth`)
- **version** — semver string
- **hash** — stable content hash (changes when methods or children change)
- **description** / **long_description** — human-readable, rendered directly in the UI
- **methods** — array of `{ name, description, streaming, bidirectional, params, returns }`
  where `params` and `returns` are JSON Schema objects
- **children** — sub-namespaces (recursive tree)

plexus-gamma walks this tree on connect, caches it, and polls `service.hash()` every few
seconds. When the hash changes (a new plugin registered, a method signature updated) the
affected subtree is re-fetched and the UI updates — no page reload.

**This is why zero-config integration works:** a new microservice that implements the
protocol is immediately visible in the explorer. If it registers itself into another
service's `registry` plugin (which plexus-gamma understands natively), it even appears
automatically without the user adding a connection manually.

---

## Zero-config microservice integration

```
1. Start a new plexus-rpc service (e.g. substrate/Rust or any language implementing the protocol)
2. It calls registry.register() on the hub
3. plexus-gamma sees the registry.list() response change
4. New backend appears in the sidebar, all plugins browsable, all methods invokable
   — with no changes to plexus-gamma, no config updates, no restarts
```

plexus-gamma also exposes itself as a plexus-rpc backend on `:44707`, so external scripts
and other services can drive the live UI over WebSocket:

```jsonc
// navigate the live browser to wiring view
{ "jsonrpc": "2.0", "id": 1, "method": "plexus-gamma.call",
  "params": { "method": "ui.navigate", "params": { "view": "wiring" } } }
```

---

## Getting started

```bash
bun install
bun run dev          # Vite (:8081) + Bun RPC server (:44707)
```

Connect a backend from the `+` button in the header bar, or set the `VITE_DEFAULT_BACKEND`
env var. The default config connects to `ws://127.0.0.1:4444` (substrate).

```bash
bun run test         # 153 Playwright functional tests
bun run screenshots  # re-capture docs/screenshots/ and update README images
```

---

## Codegen pipeline

plexus-gamma's TypeScript client files (`types.ts`, `rpc.ts`, `transport.ts`) are
generated by the synapse-cc / hub-codegen toolchain — not hand-written.

### High level

```
synapse.config.json  →  synapse-cc build  →  src/lib/plexus/{types,rpc,transport}.ts
```

The target config specifies `typescript`, `browser` transport (native WebSocket, no
Node.js `ws` package), and `--generate transport` (no IR fetch needed — purely static).

### synapse-cc pipeline (`Pipeline.hs`)

1. **generateCode** — calls `hub-codegen --output-format json --generate transport
   --transport browser`. Parses stdout JSON into `CodegenOutput { files, dependencies,
   devDependencies }`. No backend connection needed.
2. **applyMerge** (`Merge.hs`) — three-way merge: `(baseline, generated, current on disk)`.
   Files the user hasn't touched are overwritten; user-modified files are skipped with a
   warning. `package.json` is excluded.
3. **addDependencies** / **installDependencies** (`Language.hs`) — runs `bun add` /
   `bun add -D` for deps from `CodegenOutput`, then `bun install`.
4. **writeCache** — writes `synapse.lock` keyed by output dir, stores `irHash` and file
   content hashes for incremental rebuilds.

### hub-codegen transport generation (`generator/typescript/`)

With `--generate transport --transport browser`:
- `types.ts` — all `PlexusStreamItem` variants (`content`, `done`, `error`) + `StreamMetadata`
- `rpc.ts` — `PlexusRpcClient`: connects over WebSocket, sends JSON-RPC 2.0
  `{method:"backend.call", params:{method, params}}`, receives a `subscriptionId`,
  then consumes `subscription` notifications as an `AsyncGenerator<PlexusStreamItem>`
- `transport.ts` — `browser` variant: native `WebSocket`, no `import WebSocket from 'ws'`,
  tsconfig `"lib": ["ES2022", "DOM"]`

The `--output-format json` flag makes hub-codegen write `CodegenOutput` JSON to stdout
(no file writes), which synapse-cc reads from the child process's stdout pipe.

### plexus-rpc wire protocol (what `rpc.ts` implements)

```
Client → { jsonrpc:"2.0", id:N, method:"backend.call",
           params:{ method:"ns.method", params:{...} } }

Server → { id:N, result: <subscriptionId> }           ← immediate ACK
Server → { method:"subscription",
           params:{ subscription:<id>,
                    result:{ type:"content"|"done"|"error", ... } } }  ← stream
```

Every item carries `StreamMetadata { provenance, plexusHash, timestamp }`.
The generator is `AsyncIterable` — consuming code calls `for await (const item of rpc.call(...))`.

### Transport variants

| Flag | WebSocket import | tsconfig | npm dep |
|------|-----------------|----------|---------|
| `--transport browser` | none (native `WebSocket`) | `"lib": ["ES2022", "DOM"]` | none |
| `--transport ws` | `import WebSocket from 'ws'` | `"types": ["node"]` | `ws` |
| `--transport none` | not generated | — | `@plexus/rpc-client: workspace:*` |

---

## Architecture

```
Browser (Vue :8081)                     Bun server (:44707)
  App.vue                                 plexus-rpc protocol
    useBackends()  ──poll hash──▶         _info, schema, call
    useDispatch()  ──invoke─────▶         bridge → browser
    useBridge()    ◀──WS /bridge──        dispatches to Vue
                                          useDispatch()
```

See [`docs/architecture/`](docs/architecture/) for detailed design notes.
