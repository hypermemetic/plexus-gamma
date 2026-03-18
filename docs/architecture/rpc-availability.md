# RPC Method Availability

---

## Method kinds

Not all methods work the same way. There are four distinct execution models.

### 1. Server-side

The method runs entirely in the Node.js server process. The bridge and Vue app are
never involved.

```
External caller → plexus-rpc server → method.run() → result
```

**Only one method today:** `screenshot.take`. It calls the headless Playwright
browser directly. There is no bridge hop, no reactive state, no component
dependency. It works even if the bridge is disconnected.

### 2. Bridge dispatch

The method is forwarded across the bridge to the Vue app, which executes it against
module-level reactive state and returns a single result.

```
External caller
  → plexus-rpc server
  → forwardToBridge()     (bridge-connection.ts)
  → bridge WebSocket      (/bridge)
  → routeToDispatch()     (useBridge.ts)
  → useDispatch()         (useDispatch.ts)
  → useUiState / useBackends   ← module-level Vue refs
  → result
```

This covers most `ui.*`, `backends.*`, and `invoke.batch`. The handler code lives
directly in the `routeToDispatch` switch statement; no component needs to be
mounted. Because the state is module-level, these methods work from the moment the
page loads.

### 3. Bridge action (component-gated)

The method is forwarded across the bridge and then dispatched to a handler
registered by a mounted Vue component. The component registers the handler in
`onMounted` and deregisters in `onUnmounted`.

```
External caller
  → plexus-rpc server
  → forwardToBridge()
  → bridge WebSocket
  → routeToDispatch()
  → dispatch.dispatchAction()
  → callRegisteredAction()     ← throws if key absent
  → component onMounted handler
  → result
```

This covers `wiring.*`, `orchestration.*`, `replay.*`, and `assertion.*`. The
action registry (`useActionRegistry.ts`) is a plain `Map<string, fn>`. If the
component is not mounted, the key is absent and the call fails with
`"Action not available: <key> (component not mounted)"`.

### 4. Streaming

The method holds the connection open and yields multiple items over time rather than
returning once. Marked `{ streaming: true }` in the plugin definition. There are
two variants:

**Pass-through stream** — `invoke.call`

Forwards a call to a downstream backend and relays each result item as it arrives.
The stream ends when the downstream call finishes. Duration is determined by the
target method.

```
External caller
  → plexus-rpc server (streaming subscription)
  → bridge → dispatch.invokeMethod()
  → getSharedClient(backend).call(method, params)
  → downstream plexus-rpc backend
  ← items flow back through the same chain
```

**Perpetual subscription** — `state.watch`

Never emits a done item on its own. Stays open indefinitely, pushing a new item
every time a watched reactive ref changes (view, theme, backends). The caller
cancels it by closing the subscription.

```
External caller
  → plexus-rpc server (streaming subscription, no natural end)
  → bridge → makeStateWatcher()
  → Vue watchers on currentView, theme, connections
  ← emits StateEvent on each change
```

---

Every plexus-gamma RPC call travels through the bridge: the server forwards it to
the Vue app, which executes it and streams results back. The bridge itself is always
connected as long as the browser tab is open. What varies is whether the *action
handler* for a given method is currently registered.

## Why some methods are always available

Methods implemented directly in `useBridge.ts` / `useDispatch.ts` run against
module-level reactive state. They don't depend on any particular component being
mounted; the state they read and write exists for the lifetime of the page.

```
External caller
  → plexus-rpc server
  → bridge WebSocket
  → routeToDispatch()          ← always present
  → useDispatch()              ← module-level singletons
  → useUiState / useBackends
```

## Why some methods require a view or panel

Methods that manipulate canvas nodes, orchestration workflows, replay history, or
assertion tests are registered by the component that *owns* that state or DOM. They
use `registerAction(key, fn)` in `onMounted` and deregister in `onUnmounted`.

```
External caller
  → plexus-rpc server
  → bridge WebSocket
  → routeToDispatch()
  → dispatch.dispatchAction()
  → callRegisteredAction()     ← throws if key not in registry
  → component action handler   ← only present while component is mounted
```

If the component is not mounted, `callRegisteredAction` throws
`"Action not available: <key> (component not mounted)"`, which surfaces to the
caller as an RPC error.

---

## Method reference

### Always available

These methods read or mutate module-level state and have no component dependency.

| Method | Why always available |
|--------|----------------------|
| `ui.navigate` | Writes `currentView` ref (module-level `useUiState`) |
| `ui.getView` | Reads same ref |
| `ui.setTheme` | Writes `theme` ref |
| `ui.getTheme` | Reads same ref |
| `ui.focusPath` | Writes `navigateTo` ref |
| `ui.palette.open` | Writes `paletteOpen` ref |
| `ui.palette.close` | Writes `paletteOpen` ref |
| `backends.list` | Reads `connections` ref (module-level `useBackends`) |
| `backends.add` | Calls `addConnection()` on same store |
| `backends.remove` | Calls `removeConnection()` |
| `backends.setActive` | Calls `setActive()` |
| `backends.health` | Reads `health` ref |
| `backends.methods` | Reads `methodIndex` ref |
| `invoke.call` | Uses `getSharedClient` + connection from store |
| `invoke.batch` | Same |
| `state.watch` | Subscribes to module-level state watcher |
| `screenshot.take` | Calls headless browser API; no Vue state |

### Requires wiring view active (`view === 'wiring'`)

`MethodWiringCanvas` mounts when the wiring tab is visible and registers all
`wiring.*` actions. Navigating away unmounts it and deregisters them.

| Method | What it does |
|--------|--------------|
| `wiring.addMethod` | Adds an RPC node to the canvas |
| `wiring.addTransform` | Adds extract / template / merge / script / vars / layout / widget node |
| `wiring.connectNodes` | Draws an edge between two nodes |
| `wiring.removeEdge` | Removes an edge |
| `wiring.deleteNode` | Removes a node and all its edges |
| `wiring.setNodeParams` | Sets static params on a node |
| `wiring.setNodeLabel` | Renames a node |
| `wiring.setEdgeRouting` | Changes how an edge aggregates items (auto / each / collect / …) |
| `wiring.selectNode` | Selects a node, opening its param panel |
| `wiring.runNode` | Executes one node (optionally cascading downstream) |
| `wiring.getResults` | Returns each node's last result |
| `wiring.run` | Executes the full pipeline |
| `wiring.clear` | Removes all nodes and edges |
| `wiring.getJson` | Serialises the pipeline to JSON |
| `wiring.importJson` | Replaces the pipeline from JSON |
| `wiring.getState` | Returns node/edge counts and run status |
| `wiring.undo` | Undoes the last canvas mutation |
| `wiring.redo` | Redoes the last undone mutation |
| `wiring.autoLayout` | Re-arranges nodes automatically |

**How to ensure availability:**
```
await rpcCall('ui.navigate', { view: 'wiring' })
// then call wiring.* methods
```

### Requires orchestration view active (`view === 'orchestration'`)

`OrchestrationCanvas` registers `orchestration.*` actions when mounted.

| Method | What it does |
|--------|--------------|
| `orchestration.create` | Creates a new empty workflow |
| `orchestration.list` | Lists all workflows |
| `orchestration.select` | Sets the active workflow |
| `orchestration.delete` | Deletes a workflow |
| `orchestration.rename` | Renames the selected workflow |
| `orchestration.addStep` | Appends a method step |
| `orchestration.removeStep` | Removes a step |
| `orchestration.setStepParams` | Sets static params on a step |
| `orchestration.wireSteps` | Wires one step's output into another's param |
| `orchestration.removeWire` | Removes a wire |
| `orchestration.run` | Runs a workflow |
| `orchestration.stop` | Stops the running workflow |
| `orchestration.getState` | Returns run state for all workflows |

**How to ensure availability:**
```
await rpcCall('ui.navigate', { view: 'orchestration' })
// then call orchestration.* methods
```

### Requires replay panel open

The replay panel is a floating overlay toggled by the `⏱` button in the toolbar.
`ReplayPanel` registers `replay.*` actions on mount.

Note: the underlying history store (`useInvocationHistory`) is a module-level
singleton, so history is preserved across panel open/close. The availability gate
only controls whether the RPC handlers are reachable.

| Method | What it does |
|--------|--------------|
| `replay.list` | Returns all recorded invocations |
| `replay.invoke` | Re-runs a historical record by ID |
| `replay.remove` | Removes one record |
| `replay.clear` | Wipes the entire history |

**How to ensure availability:** the replay panel has no RPC method to open it.
It must be opened manually via the toolbar button before calling `replay.*`.

### Requires invoker panel visible (assertion suite open)

`AssertionSuite` is embedded inside the method invoker, which appears when a
method is selected in the explorer. It registers `assertion.*` actions on mount.

The test state (`useAssertionSuite`) is a module-level singleton persisted to
`localStorage`, so tests survive panel close. The availability gate is the same
as replay — only the handlers are gated, not the data.

| Method | What it does |
|--------|--------------|
| `assertion.list` | Lists test cases (optionally filtered by method) |
| `assertion.addTest` | Creates a test case with optional assertions |
| `assertion.removeTest` | Deletes a test case |
| `assertion.runTest` | Runs one test case against a backend |
| `assertion.runAll` | Runs all (or filtered) tests |

**How to ensure availability:** navigate to the explorer, connect a backend, and
open the invoker for a method to mount `AssertionSuite`. There is currently no
programmatic way to open it via RPC.

---

## Summary matrix

| Plugin | Availability condition |
|--------|------------------------|
| `ui.*` | Always |
| `backends.*` | Always |
| `invoke.*` | Always (target backend must be connected) |
| `state.*` | Always |
| `screenshot.*` | Always (headless browser must be running for non-error result) |
| `wiring.*` | Wiring view active |
| `orchestration.*` | Orchestration view active |
| `replay.*` | Replay panel open |
| `assertion.*` | Method invoker + assertion suite open |

## Design rationale

Gating handlers on component mount keeps the action registry honest: it only
advertises what the UI can actually execute right now. The alternative — always
registering handlers against a headless store — would mean `wiring.*` calls silently
succeed against invisible state that never renders, which is harder to reason about
and harder to test.

The tradeoff is that callers must manage view state. For automation scripts this is
straightforward: navigate first, then act. The `state.watch` stream can be used to
confirm that navigation completed before issuing gated calls.
