<template>
  <FloatPanel
    :open="!!node"
    :anchor-x="anchorX"
    :anchor-y="anchorY"
    :anchor-w="anchorW"
    :mode="mode ?? 'float'"
    :title="panelTitle"
    @close="emit('close')"
    @update:mode="emit('update:mode', $event)"
  >
    <!-- Body (only rendered when a node is selected) -->
    <div class="panel-body" ref="panelEl" v-if="node">
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
              @keydown="focusNext"
            />
          </div>
        </template>
        <!-- Returns schema -->
        <template v-if="node.method?.method.returns">
          <div class="pf-section-title" style="margin-top:8px">returns</div>
          <pre class="pf-returns">{{ formatSchema(node.method.method.returns) }}</pre>
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
          @keydown="focusNext"
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
            @keydown="focusNext"
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
            @keydown="focusNext"
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

      <!-- Output / error -->
      <template v-if="node.status === 'done' || node.status === 'error'">
        <div class="pf-output-header">
          <span class="pf-section-title" :class="node.status === 'error' ? 'pf-output-error-title' : 'pf-output-ok-title'">
            {{ node.status === 'error' ? '✕ error' : '✓ output' }}
          </span>
          <button class="pf-copy-btn" @click.stop="copyOutput" title="Copy output">⎘</button>
        </div>
        <pre class="pf-output" :class="{ 'pf-output-error': node.status === 'error' }">{{ outputText }}</pre>
      </template>
    </div>
  </FloatPanel>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import type { WireNode } from './wiringTypes'
import SchemaField from '../../components/SchemaField.vue'
import type { JsonSchema } from '../../components/SchemaField.vue'
import FloatPanel from '../../components/FloatPanel.vue'
import type { PanelMode } from '../../components/FloatPanel.vue'

const props = defineProps<{
  node: WireNode | null
  anchorX: number
  anchorY: number
  anchorW: number
  connectedParams: string[]
  availableRefs: string[]
  resolvedSchema: JsonSchema | null
  mode?: PanelMode
}>()

const emit = defineEmits<{
  close: []
  'update:params': [Record<string, unknown>]
  'update:transform': [{ path?: string; template?: string; code?: string; inputNames?: string[] }]
  'add-port': []
  'remove-port': [number]
  'update:mode': [PanelMode]
}>()

const panelEl = ref<HTMLElement | null>(null)

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

// ─── Focus management ────────────────────────────────────────
function focusFirstField() {
  nextTick(() => {
    const el = panelEl.value?.querySelector<HTMLElement>('input:not([disabled]), textarea:not([disabled])')
    el?.focus({ preventScroll: true })
  })
}

function focusNext(e: KeyboardEvent) {
  if (e.key !== 'Enter') return
  const fields = Array.from(
    panelEl.value?.querySelectorAll<HTMLElement>('input:not([disabled]), textarea:not([disabled])') ?? []
  )
  const idx = fields.indexOf(e.target as HTMLElement)
  const next = fields[idx + 1]
  if (next) {
    e.preventDefault()
    next.focus({ preventScroll: true })
  }
}

// When switching to a new node: auto-focus first field
watch(() => props.node?.id, (id) => {
  if (id) focusFirstField()
})

// ─── Output helpers ──────────────────────────────────────────
const outputText = computed(() => {
  const r = props.node?.result
  if (r === undefined || r === null) return ''
  if (typeof r === 'string') return r
  return JSON.stringify(r, null, 2)
})

function copyOutput() {
  const text = outputText.value
  navigator.clipboard.writeText(text).catch(() => { alert(text) })
}

// ─── Form helpers ─────────────────────────────────────────────
function formatSchema(s: unknown): string {
  return JSON.stringify(s, null, 2)
}

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
/* ── Body ────────────────────────────────────────────────────── */
.panel-body {
  padding: 10px;
  overflow-y: auto;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* ── Form fields ─────────────────────────────────────────────── */
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

/* ── Returns schema ──────────────────────────────────────────── */
.pf-returns {
  font-size: 9px;
  color: #a371f7;
  background: #100d1a;
  border: 1px solid #2d1f4e;
  border-radius: 3px;
  padding: 4px 6px;
  margin: 0;
  max-height: 100px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-all;
  font-family: inherit;
}

/* ── Output section ──────────────────────────────────────────── */
.pf-output-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
}
.pf-output-ok-title { color: #3fb950; }
.pf-output-error-title { color: #f85149; }
.pf-copy-btn {
  background: none;
  border: 1px solid #30363d;
  color: #8b949e;
  font-size: 11px;
  padding: 1px 5px;
  border-radius: 3px;
  cursor: pointer;
  line-height: 1;
}
.pf-copy-btn:hover { border-color: #58a6ff; color: #58a6ff; }
.pf-output {
  font-size: 11px;
  color: #3fb950;
  background: #0d1117;
  border: 1px solid #21262d;
  border-radius: 4px;
  padding: 6px 8px;
  margin: 4px 0 0;
  max-height: 180px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-all;
  user-select: text;
  cursor: text;
}
.pf-output.pf-output-error { color: #f85149; }
</style>
