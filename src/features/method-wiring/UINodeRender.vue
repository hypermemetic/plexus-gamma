<template>
  <!-- Layout: flex container, children recursively rendered -->
  <div v-if="node.kind === 'layout'" class="uin-layout" :style="layoutStyle">
    <UINodeRender
      v-for="child in layoutChildren"
      :key="child.id"
      :node="child"
      :nodes="nodes"
      :edges="edges"
      @param-update="emit('param-update', $event)"
      @trigger="emit('trigger', $event)"
    />
  </div>

  <!-- Widget: renders its actual UI element -->
  <div v-else-if="node.kind === 'widget'" class="uin-widget" :class="`uin-${node.ui.widgetKind}`">

    <!-- text: display value from result -->
    <template v-if="node.ui.widgetKind === 'text'">
      <div v-if="node.ui.label" class="uin-label">{{ node.ui.label }}</div>
      <div class="uin-text-value">{{ displayValue }}</div>
    </template>

    <!-- input: editable text, stores in node.params.value -->
    <template v-else-if="node.ui.widgetKind === 'input'">
      <label v-if="node.ui.label" class="uin-label">{{ node.ui.label }}</label>
      <input
        class="uin-input"
        :placeholder="node.ui.label || 'value'"
        :value="String(node.params.value ?? '')"
        @input="emit('param-update', { nodeId: node.id, key: 'value', value: ($event.target as HTMLInputElement).value })"
      />
    </template>

    <!-- button: click triggers re-run from this node -->
    <template v-else-if="node.ui.widgetKind === 'button'">
      <button class="uin-button" @click="emit('trigger', node.id)">
        {{ node.ui.label || String(node.result ?? 'Run') }}
      </button>
    </template>

    <!-- slider: range input, stores in node.params.value -->
    <template v-else-if="node.ui.widgetKind === 'slider'">
      <div v-if="node.ui.label" class="uin-label">{{ node.ui.label }}</div>
      <div class="uin-slider-row">
        <input
          type="range"
          class="uin-slider"
          :min="Number(node.params.min ?? 0)"
          :max="Number(node.params.max ?? 100)"
          :step="Number(node.params.step ?? 1)"
          :value="Number(node.params.value ?? node.params.min ?? 0)"
          @input="emit('param-update', { nodeId: node.id, key: 'value', value: Number(($event.target as HTMLInputElement).value) })"
        />
        <span class="uin-slider-val">{{ node.params.value ?? node.params.min ?? 0 }}</span>
      </div>
    </template>

    <!-- table: display node.result as a data table -->
    <template v-else-if="node.ui.widgetKind === 'table'">
      <div v-if="node.ui.label" class="uin-label">{{ node.ui.label }}</div>
      <div class="uin-table-scroll">
        <table v-if="tableRows.length" class="uin-table">
          <thead>
            <tr><th v-for="h in tableHeaders" :key="h">{{ h }}</th></tr>
          </thead>
          <tbody>
            <tr v-for="(row, ri) in tableRows" :key="ri">
              <td v-for="h in tableHeaders" :key="h">{{ formatCell((row as Record<string, unknown>)[h]) }}</td>
            </tr>
          </tbody>
        </table>
        <pre v-else class="uin-table-raw">{{ displayValue }}</pre>
      </div>
    </template>

  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { WireNode, WireEdge } from './wiringTypes'

defineOptions({ name: 'UINodeRender' })

const props = defineProps<{
  node: WireNode
  nodes: WireNode[]
  edges: WireEdge[]
}>()

const emit = defineEmits<{
  'param-update': [{ nodeId: string; key: string; value: unknown }]
  trigger: [string]
}>()

// Layout: find child nodes connected to this layout's input ports
const layoutChildren = computed(() => {
  if (props.node.kind !== 'layout') return []
  const slotOrder = props.node.transform.inputNames
  const childEdges = props.edges.filter(e => e.toNodeId === props.node.id)
  childEdges.sort((a, b) => slotOrder.indexOf(a.toParam) - slotOrder.indexOf(b.toParam))
  return childEdges
    .map(e => props.nodes.find(n => n.id === e.fromNodeId))
    .filter((n): n is WireNode => !!n && (n.kind === 'widget' || n.kind === 'layout'))
})

const layoutStyle = computed(() => ({
  display: 'flex',
  flexDirection: props.node.ui.dir === 'row' ? 'row' as const : 'column' as const,
  gap: `${props.node.ui.gap}px`,
  padding: `${props.node.ui.padding}px`,
  flexWrap: 'wrap' as const,
  alignItems: props.node.ui.dir === 'row' ? 'center' as const : 'stretch' as const,
}))

// Display value: prefer node.result, fall back to params.value
const displayValue = computed(() => {
  const v = props.node.result ?? props.node.params.value
  if (v === undefined || v === null) return ''
  if (typeof v === 'string') return v
  return JSON.stringify(v, null, 2)
})

// Table helpers
const tableData = computed(() => {
  const v = props.node.result ?? props.node.params.value
  return Array.isArray(v) ? v : null
})
const tableHeaders = computed(() => {
  const data = tableData.value
  if (!data || data.length === 0) return []
  const first = data[0]
  if (typeof first === 'object' && first !== null) return Object.keys(first as object)
  return ['value']
})
const tableRows = computed(() => {
  const data = tableData.value
  if (!data) return []
  return data.map(item =>
    typeof item === 'object' && item !== null
      ? item as Record<string, unknown>
      : ({ value: item } as Record<string, unknown>)
  )
})
function formatCell(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}
</script>

<style scoped>
.uin-layout {
  border: 1px dashed #2a3040;
  border-radius: 6px;
  min-width: 40px;
  min-height: 32px;
}

.uin-widget {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.uin-label {
  font-size: 10px;
  color: #8b949e;
  letter-spacing: 0.03em;
}

/* text */
.uin-text .uin-text-value {
  font-size: 13px;
  color: #c9d1d9;
  white-space: pre-wrap;
  word-break: break-word;
  background: #0d1117;
  border: 1px solid #21262d;
  border-radius: 4px;
  padding: 6px 8px;
  min-width: 100px;
  min-height: 24px;
  font-family: inherit;
}

/* input */
.uin-input {
  background: #0a0c10;
  border: 1px solid #30363d;
  border-radius: 4px;
  color: #c9d1d9;
  font-family: inherit;
  font-size: 12px;
  padding: 5px 8px;
  outline: none;
  min-width: 140px;
}
.uin-input:focus { border-color: #58a6ff; }

/* button */
.uin-button {
  background: #1a2840;
  border: 1px solid #58a6ff44;
  border-radius: 4px;
  color: #58a6ff;
  font-family: inherit;
  font-size: 12px;
  padding: 6px 16px;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
  align-self: flex-start;
}
.uin-button:hover { background: #1f3050; border-color: #58a6ff; }
.uin-button:active { background: #152238; }

/* slider */
.uin-slider-row { display: flex; align-items: center; gap: 8px; }
.uin-slider { flex: 1; accent-color: #58a6ff; min-width: 120px; }
.uin-slider-val { font-size: 11px; color: #8b949e; min-width: 32px; text-align: right; }

/* table */
.uin-table-scroll {
  overflow: auto;
  max-height: 240px;
  border: 1px solid #21262d;
  border-radius: 4px;
}
.uin-table {
  border-collapse: collapse;
  font-size: 11px;
  width: 100%;
  min-width: 200px;
}
.uin-table th {
  background: #161b22;
  color: #8b949e;
  font-weight: 500;
  padding: 4px 8px;
  border-bottom: 1px solid #21262d;
  text-align: left;
  white-space: nowrap;
}
.uin-table td {
  color: #c9d1d9;
  padding: 3px 8px;
  border-bottom: 1px solid #161b22;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.uin-table tr:last-child td { border-bottom: none; }
.uin-table tr:hover td { background: #0d1117; }
.uin-table-raw {
  font-size: 10px;
  color: #8b949e;
  padding: 6px 8px;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
  font-family: inherit;
}
</style>
