# Integrating OrchestrationCanvas into App.vue

Add exactly these lines to `/workspace/hypermemetic/plexus-gamma/src/App.vue`:

## 1. Import line (add after the existing imports in `<script setup>`)

```ts
import OrchestrationCanvas from './features/orchestration/OrchestrationCanvas.vue'
```

## 2. Extend the view type union (line 134)

Change:
```ts
const view = ref<'explorer' | 'canvas' | 'multi' | 'sheet'>('explorer')
```
To:
```ts
const view = ref<'explorer' | 'canvas' | 'multi' | 'sheet' | 'orchestration'>('explorer')
```

## 3. New view button (add inside `.view-btns` div, after the `sheet` button)

```html
<button class="view-btn" :class="{ active: view === 'orchestration' }" @click="view = 'orchestration'" title="Orchestration">&#8859;</button>
```

## 4. Template block (add inside `<main class="main">`, after the `sheet` template block)

```html
<!-- Orchestration canvas view -->
<template v-else-if="view === 'orchestration'">
  <OrchestrationCanvas
    :connections="connections"
    :method-index="methodIndex"
  />
</template>
```

---

## Summary of all 8 lines

| # | Location | Code |
|---|----------|------|
| 1 | `<script setup>` imports | `import OrchestrationCanvas from './features/orchestration/OrchestrationCanvas.vue'` |
| 2 | `view` ref type union | add `\| 'orchestration'` |
| 3 | `.view-btns` div | `<button class="view-btn" :class="{ active: view === 'orchestration' }" @click="view = 'orchestration'" title="Orchestration">&#8859;</button>` |
| 4–7 | `<main class="main">` | `<template v-else-if="view === 'orchestration'">` |
| | | `  <OrchestrationCanvas` |
| | | `    :connections="connections"` |
| | | `    :method-index="methodIndex"` |
| | | `  />` |
| 8 | | `</template>` |

The `&#8859;` character (`⊛`) matches the icon requested in the spec.
