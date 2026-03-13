# Assertion Suite — Integration into PluginDetail.vue

Wire `AssertionSuite` into `PluginDetail.vue` with the three changes below.
Total lines added: **~4**.

---

## 1. Add import (after the existing `import MethodInvoker` line)

```ts
import AssertionSuite from '../features/assertions/AssertionSuite.vue'
```

---

## 2. Replace the `<MethodInvoker v-for …>` block with a `<template v-for>` wrapper

In the `<!-- Methods -->` section, replace:

```html
<MethodInvoker
  v-for="method in schema.methods"
  :key="method.name"
  :method="method"
  :namespace="namespace"
  :backend-name="backendName"
/>
```

…with:

```html
<template v-for="method in schema.methods" :key="method.name">
  <MethodInvoker
    :method="method"
    :namespace="namespace"
    :backend-name="backendName"
  />
  <AssertionSuite
    :method="method"
    :namespace="namespace"
    :backend-name="backendName"
  />
</template>
```

---

## Complete diff

```diff
 import MethodInvoker from './MethodInvoker.vue'
+import AssertionSuite from '../features/assertions/AssertionSuite.vue'

       <div class="method-list">
-        <MethodInvoker
-          v-for="method in schema.methods"
-          :key="method.name"
-          :method="method"
-          :namespace="namespace"
-          :backend-name="backendName"
-        />
+        <template v-for="method in schema.methods" :key="method.name">
+          <MethodInvoker
+            :method="method"
+            :namespace="namespace"
+            :backend-name="backendName"
+          />
+          <AssertionSuite
+            :method="method"
+            :namespace="namespace"
+            :backend-name="backendName"
+          />
+        </template>
       </div>
```

---

## Notes

- `AssertionSuite` is initially collapsed to a single `[✓ Tests]` button — it adds
  no visual weight until the user opens it.
- It injects `rpc` from the nearest `BackendExplorer` provider (same injection key
  `'rpc'` already used by `MethodInvoker`), so no additional `provide()` calls are
  needed.
- Tests are persisted to `localStorage` under the key `'plexus-gamma:assertions'`.
  They survive page reloads and are shared across all method panels in the same
  browser tab.
- Each `AssertionSuite` instance filters its own tests by `fullPath` (e.g.
  `"echo.say"`), so tests for different methods are kept separate even though
  the underlying composable uses a single shared store.
- The `<template v-for>` wrapper is required because Vue 3 `v-for` on a `<template>`
  allows two sibling root nodes (`MethodInvoker` + `AssertionSuite`) per iteration
  without an extra wrapper `<div>`.
- If `BatchRunner` is already integrated, simply add the `AssertionSuite` line
  inside the existing `<template v-for>` block — no second wrapper needed.
