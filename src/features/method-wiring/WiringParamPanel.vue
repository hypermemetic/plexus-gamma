<template>
  <div
    v-if="node"
    class="param-panel"
    :class="isMobile ? 'param-panel-sheet' : 'param-panel-float'"
    :style="isMobile ? {} : floatStyle"
    ref="panelEl"
    @pointerdown.stop
    @click.stop
  >
    <div class="panel-handle-row" @pointerdown.stop="onDragStart">
      <span class="panel-drag-handle">⠿</span>
      <span class="panel-title">{{ panelTitle }}</span>
      <button class="panel-close-btn" @click.stop="emit('close')" title="Close">✕</button>
    </div>

    <div class="panel-body">
      <!-- RPC params -->
      <template v-if="node.kind === 'rpc'">
        <div v-if="availableRefs.length" class="pf-hint">
          ref: {{ availableRefs.map(id => '{' + id + '}').join(' ') }}
        </div>
        <SchemaField
          v-if="resolvedSchema"
          name="params"
          :schema="resolvedSchema"
          :model-value="node.params"
          @update:model-value="emit('update:params', $event as Record<string, unknown>)"
          class="pf-schema-field"
        />
        <template v-else>
          <div v-for="param in getParamNames()" :key="param" class="pf-row">
            <label class="pf-label">{{ param }}</label>
            <input
              class="pf-input"
              :placeholder="connectedParams.includes(param) ? '(wired)' : 'value'"
              :disabled="connectedParams.includes(param)"
              :value="nodeParamValue(param)"
              @input="setParam(param, ($event.target as HTMLInputElement).value)"
            />
          </div>
        </template>
      </template>

      <!-- Extract -->
      <template v-else-if="node.kind === 'extract'">
        <div class="pf-section-title">dot-path</div>
        <input
          class="pf-input pf-full"
          placeholder="e.g. result.text"
          :value="node.transform.path"
          @input="emit('update:transform', { path: ($event.target as HTMLInputElement).value })"
        />
      </template>

      <!-- Template -->
      <template v-else-if="node.kind === 'template'">
        <div class="pf-section-title">template <span class="pf-hint-inline">use &#123;&#123;name&#125;&#125;</span></div>
        <textarea
          class="pf-textarea"
          placeholder="Hello {{input}}"
          rows="3"
          :value="node.transform.template"
          @input="emit('update:transform', { template: ($event.target as HTMLTextAreaElement).value })"
        />
        <div class="pf-section-title" style="margin-top:8px">ports</div>
        <div v-for="(_, pi) in node.transform.inputNames" :key="pi" class="pf-row">
          <input
            class="pf-input pf-port-name"
            placeholder="port name"
            :value="node.transform.inputNames[pi]"
            @input="updatePortName(pi, ($event.target as HTMLInputElement).value)"
          />
          <button class="pf-del-btn" @click.stop="emit('remove-port', pi)" title="Remove">✕</button>
        </div>
        <button class="pf-add-btn" @click.stop="emit('add-port')">+ port</button>
      </template>

      <!-- Merge -->
      <template v-else-if="node.kind === 'merge'">
        <div class="pf-section-title">ports</div>
        <div v-for="(_, pi) in node.transform.inputNames" :key="pi" class="pf-row">
          <input
            class="pf-input pf-port-name"
            placeholder="field name"
            :value="node.transform.inputNames[pi]"
            @input="updatePortName(pi, ($event.target as HTMLInputElement).value)"
          />
          <button class="pf-del-btn" @click.stop="emit('remove-port', pi)" title="Remove">✕</button>
        </div>
        <button class="pf-add-btn" @click.stop="emit('add-port')">+ port</button>
      </template>

      <!-- Script -->
      <template v-else-if="node.kind === 'script'">
        <div class="pf-section-title">code <span class="pf-hint-inline">fn(input)</span></div>
        <textarea
          class="pf-textarea"
          placeholder="x => x.result"
          rows="4"
          :value="node.transform.code"
          @input="emit('update:transform', { code: ($event.target as HTMLTextAreaElement).value })"
        />
      </template>
    </div>
  </div>

  <!-- Mobile backdrop -->
  <div
    v-if="node && isMobile"
    class="param-panel-backdrop"
    @pointerdown="emit('close')"
  />
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import type { WireNode } from './wiringTypes'
import SchemaField from '../../components/SchemaField.vue'
import type { JsonSchema } from '../../components/SchemaField.vue'

const props = defineProps<{
  node: WireNode | null
  anchorX: number
  anchorY: number
  anchorW: number
  connectedParams: string[]
  availableRefs: string[]
  resolvedSchema: JsonSchema | null
}>()

const emit = defineEmits<{
  close: []
  'update:params': [Record<string, unknown>]
  'update:transform': [{ path?: string; template?: string; code?: string; inputNames?: string[] }]
  'add-port': []
  'remove-port': [number]
}>()

const panelEl = ref<HTMLElement | null>(null)
const panelW = ref(300)
const panelH = ref(200)
const dragOffset = ref<{ x: number; y: number } | null>(null)
const manualPos = ref<{ left: number; top: number } | null>(null)

const isMobile = computed(() => typeof window !== 'undefined' && window.innerWidth < 680)

const panelTitle = computed(() => {
  if (!props.node) return ''
  switch (props.node.kind) {
    case 'rpc':      return props.node.method?.fullPath ?? 'RPC'
    case 'extract':  return 'Extract'
    case 'template': return 'Template'
    case 'merge':    return 'Merge'
    case 'script':   return 'Script'
  }
})

const floatStyle = computed(() => {
  if (manualPos.value) {
    return { left: manualPos.value.left + 'px', top: manualPos.value.top + 'px' }
  }
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800
  let left = props.anchorX + props.anchorW + 14
  if (left + panelW.value > vw - 8) left = props.anchorX - panelW.value - 14
  if (left < 4) left = 4
  let top = props.anchorY
  if (top + panelH.value > vh - 8) top = vh - panelH.value - 8
  if (top < 4) top = 4
  return { left: left + 'px', top: top + 'px' }
})

function onDragStart(e: PointerEvent) {
  if (!panelEl.value) return
  const rect = panelEl.value.getBoundingClientRect()
  dragOffset.value = { x: e.clientX - rect.left, y: e.clientY - rect.top }
  document.addEventListener('pointermove', onDragMove)
  document.addEventListener('pointerup', onDragEnd)
}

function onDragMove(e: PointerEvent) {
  if (!dragOffset.value) return
  manualPos.value = { left: e.clientX - dragOffset.value.x, top: e.clientY - dragOffset.value.y }
}

function onDragEnd() {
  dragOffset.value = null
  document.removeEventListener('pointermove', onDragMove)
  document.removeEventListener('pointerup', onDragEnd)
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

function onDocPointerDown(e: PointerEvent) {
  if (!panelEl.value) return
  if (!panelEl.value.contains(e.target as Node)) emit('close')
}

onMounted(() => {
  document.addEventListener('keydown', onKeyDown)
  document.addEventListener('pointerdown', onDocPointerDown)
  nextTick(() => {
    if (panelEl.value) {
      panelW.value = panelEl.value.offsetWidth || 300
      panelH.value = panelEl.value.offsetHeight || 200
    }
  })
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeyDown)
  document.removeEventListener('pointerdown', onDocPointerDown)
  document.removeEventListener('pointermove', onDragMove)
  document.removeEventListener('pointerup', onDragEnd)
})

// ─── Param helpers ────────────────────────────────────────────
function getParamNames(): string[] {
  const node = props.node
  if (!node) return []
  if (node.kind === 'extract' || node.kind === 'script') return ['input']
  if (node.kind === 'template' || node.kind === 'merge') return [...node.transform.inputNames]
  const params = node.method?.method.params
  if (!params || typeof params !== 'object') return []
  const p = params as Record<string, unknown>
  if (p['type'] === 'object' && p['properties']) return Object.keys(p['properties'] as object)
  return []
}

function nodeParamValue(param: string): string {
  const v = props.node?.params[param]
  return v === undefined || v === null ? '' : String(v)
}

function setParam(param: string, value: unknown) {
  if (!props.node) return
  emit('update:params', { ...props.node.params, [param]: value })
}

function updatePortName(pi: number, value: string) {
  if (!props.node) return
  const names = [...props.node.transform.inputNames]
  names[pi] = value
  emit('update:transform', { inputNames: names })
}
</script>

<style scoped>
.param-panel {
  background: #13161c;
  border: 1px solid #30363d;
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.6);
  min-width: 260px;
  max-width: 380px;
  z-index: 300;
  font-family: 'Berkeley Mono', 'Fira Code', ui-monospace, monospace;
  font-size: 12px;
  color: #c9d1d9;
  overflow: hidden;
}

.param-panel-float {
  position: absolute;
}

.param-panel-sheet {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  max-height: 70vh;
  max-width: 100%;
  border-radius: 12px 12px 0 0;
  overflow-y: auto;
  z-index: 300;
}

.param-panel-backdrop {
  position: fixed;
  inset: 0;
  z-index: 299;
  background: rgba(0,0,0,0.3);
}

.panel-handle-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px 7px;
  background: #1a1d23;
  border-bottom: 1px solid #21262d;
  cursor: grab;
  user-select: none;
}
.panel-handle-row:active { cursor: grabbing; }

.panel-drag-handle { font-size: 12px; color: #484f58; flex-shrink: 0; }

.panel-title {
  flex: 1;
  font-size: 11px;
  color: #8b949e;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.panel-close-btn {
  background: none;
  border: none;
  color: #484f58;
  font-size: 13px;
  cursor: pointer;
  padding: 0 2px;
  line-height: 1;
  flex-shrink: 0;
}
.panel-close-btn:hover { color: #f85149; }

.panel-body {
  padding: 10px;
  overflow-y: auto;
  max-height: calc(70vh - 40px);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.pf-hint { font-size: 9px; color: #3a5a3a; font-style: italic; margin-bottom: 2px; }
.pf-hint-inline { font-size: 9px; color: #3a5a3a; font-style: italic; }

.pf-section-title {
  font-size: 10px;
  color: #484f58;
  letter-spacing: 0.05em;
  margin-bottom: 2px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.pf-row { display: flex; align-items: center; gap: 6px; margin-bottom: 2px; }
.pf-label { font-size: 10px; color: #8b949e; min-width: 50px; flex-shrink: 0; }

.pf-input {
  flex: 1;
  background: #0a0c10;
  border: 1px solid #30363d;
  border-radius: 3px;
  color: #c9d1d9;
  font-family: inherit;
  font-size: 10px;
  padding: 3px 6px;
  outline: none;
  min-width: 0;
}
.pf-input:focus { border-color: #58a6ff; }
.pf-input:disabled { color: #484f58; }
.pf-full { width: 100%; box-sizing: border-box; }
.pf-port-name { min-width: 80px; max-width: 140px; flex: 1; }

.pf-textarea {
  width: 100%;
  background: #0a0c10;
  border: 1px solid #30363d;
  border-radius: 3px;
  color: #c9d1d9;
  font-family: inherit;
  font-size: 10px;
  padding: 4px 6px;
  resize: vertical;
  box-sizing: border-box;
  outline: none;
  line-height: 1.4;
}
.pf-textarea:focus { border-color: #58a6ff; }

.pf-del-btn {
  background: none;
  border: none;
  color: #484f58;
  cursor: pointer;
  font-size: 10px;
  padding: 1px 3px;
  flex-shrink: 0;
}
.pf-del-btn:hover { color: #f85149; }

.pf-add-btn {
  background: none;
  border: 1px solid #30363d;
  color: #484f58;
  font-family: inherit;
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 3px;
  cursor: pointer;
  margin-top: 2px;
  align-self: flex-start;
}
.pf-add-btn:hover { border-color: #58a6ff; color: #58a6ff; }

.pf-schema-field { margin-top: 2px; }
</style>
