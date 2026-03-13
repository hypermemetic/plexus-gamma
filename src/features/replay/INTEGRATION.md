# Replay / Time-Travel — Integration Guide

Wire the Replay panel into `src/App.vue` with the changes below.
Total lines added: **11** (2 imports + 3 script lines + 1 button + 1 component).

---

## 1. Add imports (after the existing `import { scanPortRange }` line)

```ts
import { useInvocationHistory } from './features/replay/useInvocationHistory'
import ReplayPanel from './features/replay/ReplayPanel.vue'
```

---

## 2. Script setup additions (after the `provide('pendingMethod', pendingMethod)` line)

```ts
// ─── Replay / Time-Travel ────────────────────────────────────
const invocationHistory = useInvocationHistory()
provide('invocationHistory', invocationHistory)
const replayOpen = ref(false)
```

---

## 3. History button in `.conn-bar-right` (add before the `<div class="view-btns">` element)

```html
<button class="palette-trigger" @click="replayOpen = !replayOpen" title="Invocation history (⏱)">⏱</button>
```

---

## 4. ReplayPanel component (add just before the closing `</div>` of `.app`, after `</main>`)

```html
<ReplayPanel :open="replayOpen" @close="replayOpen = false" />
```

---

## Complete diff

```diff
 // ── existing imports ───────────────────────────────────────
 import { scanPortRange } from './lib/plexus/discover'
+import { useInvocationHistory } from './features/replay/useInvocationHistory'
+import ReplayPanel from './features/replay/ReplayPanel.vue'

 // ── existing provide ───────────────────────────────────────
 provide('pendingMethod', pendingMethod)
+
+// ─── Replay / Time-Travel ────────────────────────────────────
+const invocationHistory = useInvocationHistory()
+provide('invocationHistory', invocationHistory)
+const replayOpen = ref(false)

 // ── inside .conn-bar-right, before <div class="view-btns"> ──
+<button class="palette-trigger" @click="replayOpen = !replayOpen" title="Invocation history (⏱)">⏱</button>

 // ── inside .app div, after </main> ────────────────────────
+<ReplayPanel :open="replayOpen" @close="replayOpen = false" />
```

---

## Enabling automatic invocation recording from MethodInvoker

The `useInvocationHistory()` composable exposes a module-level singleton.
To record every invocation automatically, add the following inside
`MethodInvoker.vue`'s `invoke()` function (after `running.value = false`
in the `finally` block):

```ts
import { useInvocationHistory } from '../features/replay/useInvocationHistory'

// Inside invoke(), capture start time before the for-await loop:
const startMs = Date.now()

// Inside the finally block, after running.value = false:
const { record } = useInvocationHistory()
record({
  timestamp: Date.now(),
  backend: props.backendName,
  method: fullPath.value,
  params,
  results: results.value
    .filter(r => r.type === 'data')
    .map(r => r.content),
  durationMs: Date.now() - startMs,
})
```

Without this wiring, users can still manually log entries via the
**manual save** accordion inside the history panel.

---

## Notes

- The panel slides in from the right, fixed-positioned at `top: 36px` (below the conn-bar).
- The `invocationHistory` provide makes the singleton available to any descendant component via `inject('invocationHistory', null)`.
- The `rpc` client is also injected (already provided by `BackendExplorer.vue`) so replay calls go to the currently active backend connection.
- History is persisted in `localStorage` under the key `plexus-gamma:history` (max 200 records, oldest dropped).
