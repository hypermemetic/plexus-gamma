# Batch Runner — Integration into PluginDetail.vue

Wire `BatchRunner` into `PluginDetail.vue` with the four changes below.
Total lines added: **~4**.

---

## 1. Add import (after the existing `import MethodInvoker` line)

```ts
import BatchRunner from '../features/batch-runner/BatchRunner.vue'
```

---

## 2. Add `<BatchRunner>` after each `<MethodInvoker>` in the `v-for` loop

In the `<!-- Methods -->` section, replace the existing `<MethodInvoker>` tag:

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
  <BatchRunner
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
+import BatchRunner from '../features/batch-runner/BatchRunner.vue'

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
+          <BatchRunner
+            :method="method"
+            :namespace="namespace"
+            :backend-name="backendName"
+          />
+        </template>
       </div>
```

---

## Notes

- `BatchRunner` is initially collapsed to a single `[⊞ Batch]` button — it adds
  no visual weight until the user opens it.
- It injects `rpc` from the nearest `BackendExplorer` provider (same injection key
  `'rpc'` already used by `MethodInvoker`), so no additional `provide()` calls are
  needed.
- Each `BatchRunner` instance is independent per method; collapsing one does not
  affect others.
- The `<template v-for>` wrapper is required because Vue 3 `v-for` on a `<template>`
  allows two sibling root nodes (`MethodInvoker` + `BatchRunner`) per iteration
  without an extra wrapper `<div>`.
