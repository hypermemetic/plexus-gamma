# plexus-gamma

A live web UI explorer for [plexus-rpc](https://github.com/hypermemetic/plexus) backends.
Browse plugins, inspect methods, invoke RPC calls, and visualize backend topology — all from the browser.

<p align="center">
  <img src="docs/screenshots/01-explorer.png" width="49%" alt="Explorer view" />
  <img src="docs/screenshots/02-topology.png" width="49%" alt="Topology canvas" />
</p>
<p align="center">
  <img src="docs/screenshots/03-sheet.png" width="49%" alt="Sheet view" />
  <img src="docs/screenshots/04-wiring.png" width="49%" alt="Method wiring" />
</p>

## Views

| View | Description |
|------|-------------|
| **explore** | Tree browser + plugin detail pane. Inspect methods, schemas, and invoke calls live. |
| **topology** | Canvas graph of all connected backends and their plugin relationships. |
| **sheet** | All backends shown simultaneously; click any node to slide up a detail sheet. |
| **wiring** | Drag-and-drop method wiring canvas for composing multi-step RPC pipelines. |
| **orchestrate** | Workflow editor for sequencing and parameterizing method chains. |

## Getting started

```bash
bun install
bun run dev          # Vite (:8081) + Bun RPC server (:44707)
```

Connect a backend from the `+` button in the top bar, or edit `src/lib/useBackends.ts`
to add a default connection.

## Running tests

```bash
bun run test         # 155 Playwright functional tests
bun run screenshots  # capture docs/screenshots/ (updates README images)
```

## Architecture

plexus-gamma is itself a plexus-rpc backend on `:44707`. External callers can drive the
live UI over WebSocket — navigate views, add backends, invoke methods, watch state:

```
External caller  →  ws://localhost:44707  →  Bun server  →  /bridge  →  Vue app
```

See [`docs/architecture/`](docs/architecture/) for design notes.
