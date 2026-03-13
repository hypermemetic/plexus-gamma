# Method Wiring Canvas — App.vue Integration

Add exactly the following 8 lines to `src/App.vue` (do NOT create new files; only edit existing `App.vue`).

---

## 1. Import line

Add after the existing `import TreeSheetView ...` line:

```ts
import MethodWiringCanvas from './features/method-wiring/MethodWiringCanvas.vue'
```

---

## 2. `view` type union — add `'wiring'`

Change this line:

```ts
const view = ref<'explorer' | 'canvas' | 'multi' | 'sheet'>('explorer')
```

To:

```ts
const view = ref<'explorer' | 'canvas' | 'multi' | 'sheet' | 'wiring'>('explorer')
```

---

## 3. New view button in `.view-btns`

Add after the `sheet` view button (inside the `.view-btns` div):

```html
<button class="view-btn" :class="{ active: view === 'wiring' }" @click="view = 'wiring'" title="Method wiring">&#8865;</button>
```

(`&#8865;` is `⊡`)

---

## 4. New template block in `<main class="main">`

Add after the closing `</template>` of the `v-else-if="view === 'sheet'"` block:

```html
<!-- Method wiring canvas -->
<template v-else-if="view === 'wiring'">
  <MethodWiringCanvas
    :connections="connections"
    :method-index="methodIndex"
  />
</template>
```

---

## Complete diff (8 meaningful lines)

```diff
+import MethodWiringCanvas from './features/method-wiring/MethodWiringCanvas.vue'

-const view = ref<'explorer' | 'canvas' | 'multi' | 'sheet'>('explorer')
+const view = ref<'explorer' | 'canvas' | 'multi' | 'sheet' | 'wiring'>('explorer')

 <!-- inside .view-btns -->
+<button class="view-btn" :class="{ active: view === 'wiring' }" @click="view = 'wiring'" title="Method wiring">&#8865;</button>

 <!-- inside <main class="main">, after sheet template -->
+<template v-else-if="view === 'wiring'">
+  <MethodWiringCanvas
+    :connections="connections"
+    :method-index="methodIndex"
+  />
+</template>
```

Total: 8 lines added (1 import + 1 type change + 1 button + 5 template lines).

---

## Notes

- `MethodWiringCanvas` creates its own `PlexusRpcClient` instances from the `connections` prop — no `provide`/`inject` needed.
- The `:method-index` prop feeds the sidebar from the existing `methodIndex` ref that is already populated by `onTreeReady`.
- No existing component or file is modified by the component itself.
