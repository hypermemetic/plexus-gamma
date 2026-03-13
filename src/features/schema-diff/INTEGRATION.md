# Schema Diff — Integration into BackendExplorer.vue

`BackendExplorer.vue` already has a `tree` ref (`ref<PluginNode | null>(null)`) that is
populated by `buildTree` in `refresh()`.  Wire the diff feature in 8 steps:

## 1. Add imports (top of `<script setup>`)

```ts
import { useSchemaDiff } from '../features/schema-diff/useSchemaDiff'
import SchemaDiffBanner from '../features/schema-diff/SchemaDiffBanner.vue'
```

## 2. Call the composable (after `tree` and `rpc` are declared)

```ts
const { pendingDiff, dismiss, accept } = useSchemaDiff(rpc, props.connection.name, tree)
```

`tree` is already `ref<PluginNode | null>(null)` in BackendExplorer — no extra ref needed.

## 3. Define `triggerRefresh` (or reuse the existing `refresh` function)

```ts
function triggerRefresh(): void { void refresh() }
```

## 4. Add the banner to the template

Place `<SchemaDiffBanner>` at the bottom of `.explorer`'s content area so it sits
above the sidebar/detail split and sticks to the bottom edge via `position: sticky`:

```html
<SchemaDiffBanner
  :diff="pendingDiff"
  @dismiss="dismiss"
  @accept="() => { accept(); triggerRefresh() }"
/>
```

Full template example (condensed):

```html
<template>
  <div class="explorer">
    <aside class="sidebar">…</aside>
    <PluginDetail v-if="!treeOnly" … />
    <SchemaDiffBanner
      :diff="pendingDiff"
      @dismiss="dismiss"
      @accept="() => { accept(); triggerRefresh() }"
    />
  </div>
</template>
```

## 5. Ensure `.explorer` allows sticky children

`.explorer` already has `overflow: hidden` for its own scroll management.  The banner
uses `position: sticky; bottom: 0` and will overlay content inside the flex row.
No CSS changes are required to the existing `.explorer` rule.

## Note on hash polling coexistence

`useSchemaDiff` polls `{backendName}.hash` every **3 s** independently of the 2 s
poll already in `BackendExplorer`.  Both pollers coexist safely — the existing poller
triggers an immediate silent `refresh()`, while `useSchemaDiff` shows the diff banner
first and lets the user decide when to reload.  To avoid the silent auto-refresh, you
may remove or gate the existing `hashTimer` / `pollHash` logic inside BackendExplorer
once the banner is wired in.
