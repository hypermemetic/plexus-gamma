# Backend Health Dashboard — Integration Guide

Wire the health strip and dashboard into `src/App.vue` with the changes below.
Total lines added: **5** (1 import + 1 component tag + optional `provide`).

---

## 1. Add import (after the existing component imports)

```ts
import HealthDashboard from './features/health/HealthDashboard.vue'
```

---

## 2. Add `<HealthDashboard>` inside `.conn-bar-right` (after the `<div class="conn-bar-right">` open tag, before the scan-badge span)

```html
<!-- Backend health strip -->
<HealthDashboard :connections="connections" />
```

The full `.conn-bar-right` section becomes:

```html
<div class="conn-bar-right">
  <!-- Backend health strip -->
  <HealthDashboard :connections="connections" />

  <!-- Scan badge -->
  <span v-if="scanning" class="scan-badge">
    <span class="pulse-dot">◌</span> scanning…
  </span>

  <!-- ... rest unchanged ... -->
</div>
```

---

## 3. Optional: provide `recordCall` for automatic latency tracking

`HealthDashboard` already calls `provide('recordCall', recordCall)` internally.
Any descendant component (e.g., `MethodInvoker.vue`) can inject it:

```ts
// Inside MethodInvoker.vue <script setup>
const recordCall = inject<(name: string, latencyMs: number, error: boolean) => void>('recordCall')

// Then after each RPC call completes:
recordCall?.(props.backendName, Date.now() - startMs, hadError)
```

No additional changes to `App.vue` are needed for this to work — the provide
is established the moment `<HealthDashboard>` mounts.

---

## Complete diff

```diff
 import CommandPalette from './components/CommandPalette.vue'
+import HealthDashboard from './features/health/HealthDashboard.vue'

 // inside template, at the start of .conn-bar-right:
 <div class="conn-bar-right">
+  <HealthDashboard :connections="connections" />
   <span v-if="scanning" class="scan-badge">
```

---

## Notes

- The health strip renders inline inside `.conn-bar-right`, compact and zero-height-overhead.
- Clicking any chip or the `⊕` button opens the full dashboard overlay.
- The overlay is mounted via `<Teleport to="body">` — it escapes all stacking contexts.
- Hash-change pulse (⚡ icon + yellow flash on the badge) lasts 30 seconds after detection.
- `recordCall` is provided under the key `'recordCall'` and is optional — the health composable
  also polls independently every 5s for its own latency measurements.
- The `HealthDashboard` creates one `PlexusRpcClient` per backend — these are distinct from the
  clients in `BackendExplorer`. The health clients only call `{name}.hash` and are cleaned up
  automatically when the component unmounts.
