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
          ref: <span v-for="id in availableRefs" :key="id" class="pf-hint-ref">&#123;&#123;{{ id }}&#125;&#125;</span>
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
          <pre class="pf-returns">{{ formatReturnSchema(node.method.method.returns) }}</pre>
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

        <!-- Live preview -->
        <template v-if="templatePreview !== null">
          <div class="pf-section-title" style="margin-top:8px">preview</div>
          <pre class="pf-template-preview">{{ templatePreview }}</pre>
        </template>

        <!-- Variable list with type info -->
        <template v-if="templateVars.length > 0">
          <div class="pf-section-title" style="margin-top:8px">variables</div>
          <div v-for="v in templateVars" :key="v.name" class="pf-var-row">
            <span class="pf-var-name">&#123;&#123;{{ v.name }}&#125;&#125;</span>
            <span v-if="v.connected" class="pf-var-type">{{ v.typeName }}</span>
            <span v-if="v.connected && v.preview" class="pf-var-preview">{{ v.preview }}</span>
            <span v-if="!v.connected" class="pf-var-unset">not connected</span>
          </div>
        </template>

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

      <!-- Vars: key-value store editor -->
      <template v-else-if="node.kind === 'vars'">
        <div class="pf-row" style="margin-bottom:4px">
          <label class="pf-label">name</label>
          <input
            class="pf-input"
            placeholder="vars"
            :value="node.ui.storeName"
            @input="emit('update:ui', { storeName: ($event.target as HTMLInputElement).value })"
          />
        </div>
        <div class="pf-section-title">store</div>
        <div v-for="key in Object.keys(node.ui.store)" :key="key" class="pf-row">
          <span class="pf-label pf-key-label">{{ key }}</span>
          <input
            class="pf-input"
            :value="String(node.ui.store[key] ?? '')"
            @input="updateStoreKey(key, ($event.target as HTMLInputElement).value)"
          />
          <button class="pf-del-btn" @click.stop="deleteStoreKey(key)" title="Remove">✕</button>
        </div>
        <div class="pf-row pf-add-key-row">
          <input class="pf-input" v-model="newKeyName" placeholder="new key" @keydown.enter.prevent="addStoreKey" />
          <button class="pf-add-btn pf-add-key-btn" @click.stop="addStoreKey">+ key</button>
        </div>
        <div v-if="Object.keys(node.ui.store).length" class="pf-hint" style="margin-top:4px">
          ref: {{ Object.keys(node!.ui.store).map(k => '{' + node!.id + '.' + k + '}').join(' ') }}
        </div>
      </template>

      <!-- Widget: kind picker + label -->
      <template v-else-if="node.kind === 'widget'">
        <div class="pf-section-title">widget type</div>
        <div class="pf-widget-kinds">
          <button
            v-for="wk in WIDGET_KINDS" :key="wk"
            class="pf-kind-btn"
            :class="{ active: node.ui.widgetKind === wk }"
            @click.stop="emit('update:ui', { widgetKind: wk as WidgetKind })"
          >{{ wk }}</button>
        </div>
        <div class="pf-row" style="margin-top:6px">
          <label class="pf-label">label</label>
          <input
            class="pf-input"
            placeholder="optional label"
            :value="node.ui.label"
            @input="emit('update:ui', { label: ($event.target as HTMLInputElement).value })"
          />
        </div>
        <!-- Slider-specific params -->
        <template v-if="node.ui.widgetKind === 'slider'">
          <div class="pf-row">
            <label class="pf-label">min</label>
            <input class="pf-input" type="number" :value="node.params.min ?? 0"
              @input="emit('update:params', { ...node.params, min: Number(($event.target as HTMLInputElement).value) })" />
          </div>
          <div class="pf-row">
            <label class="pf-label">max</label>
            <input class="pf-input" type="number" :value="node.params.max ?? 100"
              @input="emit('update:params', { ...node.params, max: Number(($event.target as HTMLInputElement).value) })" />
          </div>
          <div class="pf-row">
            <label class="pf-label">step</label>
            <input class="pf-input" type="number" :value="node.params.step ?? 1"
              @input="emit('update:params', { ...node.params, step: Number(($event.target as HTMLInputElement).value) })" />
          </div>
        </template>
        <!-- Binding: input + slider -->
        <template v-if="node.ui.widgetKind === 'input' || node.ui.widgetKind === 'slider'">
          <div class="pf-section-title" style="margin-top:8px">binding</div>
          <div class="pf-row">
            <label class="pf-label">target</label>
            <input
              class="pf-input"
              placeholder="nodeId.key"
              :value="node.ui.binding"
              @change="emit('update:ui', { binding: ($event.target as HTMLInputElement).value })"
            />
          </div>
          <div v-if="node.ui.binding && bindingTargetLabel" class="pf-hint">
            → {{ bindingTargetLabel }}
          </div>
          <div class="pf-row">
            <label class="pf-label pf-cb-label">
              <input
                type="checkbox"
                :checked="node.ui.autoRun"
                @change="emit('update:ui', { autoRun: ($event.target as HTMLInputElement).checked })"
              />
              auto-run
            </label>
          </div>
        </template>
        <!-- Run mode: button -->
        <template v-if="node.ui.widgetKind === 'button'">
          <div class="pf-section-title" style="margin-top:8px">run mode</div>
          <div class="pf-widget-kinds">
            <button
              class="pf-kind-btn"
              :class="{ active: node.ui.runMode === 'partial' }"
              @click.stop="emit('update:ui', { runMode: 'partial' })"
            >partial</button>
            <button
              class="pf-kind-btn"
              :class="{ active: node.ui.runMode === 'full' }"
              @click.stop="emit('update:ui', { runMode: 'full' })"
            >full</button>
          </div>
        </template>
      </template>

      <!-- Layout: direction, gap, padding, slots -->
      <template v-else-if="node.kind === 'layout'">
        <div class="pf-section-title">direction</div>
        <div class="pf-widget-kinds">
          <button class="pf-kind-btn" :class="{ active: node.ui.dir === 'row' }" @click.stop="emit('update:ui', { dir: 'row' as LayoutDir })">row →</button>
          <button class="pf-kind-btn" :class="{ active: node.ui.dir === 'col' }" @click.stop="emit('update:ui', { dir: 'col' as LayoutDir })">col ↓</button>
        </div>
        <div class="pf-row" style="margin-top:6px">
          <label class="pf-label">gap</label>
          <input class="pf-input" type="number" :value="node.ui.gap"
            @input="emit('update:ui', { gap: Number(($event.target as HTMLInputElement).value) })" />
        </div>
        <div class="pf-row">
          <label class="pf-label">padding</label>
          <input class="pf-input" type="number" :value="node.ui.padding"
            @input="emit('update:ui', { padding: Number(($event.target as HTMLInputElement).value) })" />
        </div>
        <div class="pf-section-title" style="margin-top:8px">slots</div>
        <div v-for="(_, pi) in node.transform.inputNames" :key="pi" class="pf-row">
          <input
            class="pf-input pf-port-name"
            placeholder="slot name"
            :value="node.transform.inputNames[pi]"
            @input="updatePortName(pi, ($event.target as HTMLInputElement).value)"
            @keydown="focusNext"
          />
          <button class="pf-del-btn" @click.stop="emit('remove-port', pi)" title="Remove">✕</button>
        </div>
        <button class="pf-add-btn" @click.stop="emit('add-port')">+ slot</button>
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
import type { WireNode, NodeUi, WidgetKind, LayoutDir } from './wiringTypes'
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
  /** Current upstream result values keyed by this node's input param names */
  inputValues?: Record<string, unknown>
}>()

const emit = defineEmits<{
  close: []
  'update:params': [Record<string, unknown>]
  'update:transform': [{ path?: string; template?: string; code?: string; inputNames?: string[] }]
  'update:ui': [Partial<NodeUi>]
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
    case 'vars':     return props.node.ui.storeName || 'vars'
    case 'widget':   return `widget: ${props.node.ui.widgetKind}`
    case 'layout':   return `layout: ${props.node.ui.dir}`
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

// ─── Mustache template preview ────────────────────────────────
interface TemplateVar { name: string; connected: boolean; typeName: string; preview: string }

const templateVars = computed((): TemplateVar[] => {
  if (!props.node || props.node.kind !== 'template') return []
  const names = props.node.transform.inputNames
  const vals = props.inputValues ?? {}
  return names.map(name => {
    const v = vals[name]
    const connected = name in vals
    let typeName = ''
    let preview = ''
    if (connected && v !== undefined && v !== null) {
      typeName = Array.isArray(v) ? `array[${(v as unknown[]).length}]` : typeof v
      const str = typeof v === 'string' ? v : JSON.stringify(v)
      preview = str.length > 48 ? str.slice(0, 48) + '…' : str
    }
    return { name, connected, typeName, preview }
  })
})

const templatePreview = computed((): string | null => {
  if (!props.node || props.node.kind !== 'template') return null
  const tmpl = props.node.transform.template
  if (!tmpl) return null
  const vals = props.inputValues ?? {}
  return tmpl.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (!(key in vals)) return match
    const v = vals[key]
    if (v === undefined || v === null) return match
    return typeof v === 'string' ? v : JSON.stringify(v)
  })
})

// ─── Form helpers ─────────────────────────────────────────────
/** Render a JSON schema as a readable TypeScript-style type signature. */
function formatReturnSchema(schema: unknown, depth = 0): string {
  if (!schema || typeof schema !== 'object') return 'unknown'
  const s = schema as Record<string, unknown>

  if (typeof s['$ref'] === 'string') {
    return s['$ref'].split('/').pop() ?? 'ref'
  }
  if (Array.isArray(s['enum'])) {
    const vals = (s['enum'] as unknown[]).slice(0, 8).map(v => JSON.stringify(v))
    const suffix = (s['enum'] as unknown[]).length > 8 ? ` | …` : ''
    return vals.join(' | ') + suffix
  }

  const rawType = s['type']
  const types: string[] = Array.isArray(rawType)
    ? rawType.filter((t): t is string => typeof t === 'string')
    : typeof rawType === 'string' ? [rawType] : []
  const nullable = types.includes('null')
  const nonNull = types.filter(t => t !== 'null')
  const type = nonNull[0]

  let core: string
  if (type === 'object') {
    const props = s['properties'] as Record<string, unknown> | undefined
    if (props && Object.keys(props).length > 0) {
      const req = Array.isArray(s['required']) ? (s['required'] as string[]) : []
      const pad = '  '.repeat(depth + 1)
      const basePad = '  '.repeat(depth)
      const entries = Object.entries(props).map(([k, v]) => {
        const opt = req.includes(k) ? '' : '?'
        return `${pad}${k}${opt}: ${formatReturnSchema(v, depth + 1)}`
      })
      core = `{\n${entries.join('\n')}\n${basePad}}`
    } else {
      core = 'object'
    }
  } else if (type === 'array') {
    const inner = s['items'] ? formatReturnSchema(s['items'], depth) : 'unknown'
    core = `${inner}[]`
  } else {
    core = type ?? 'unknown'
  }

  return nullable && core !== 'null' ? `${core} | null` : core
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

// ─── Binding helpers ──────────────────────────────────────────
const bindingTargetLabel = computed(() => {
  const b = props.node?.ui.binding ?? ''
  if (!b.includes('.')) return ''
  const dotIdx = b.indexOf('.')
  const nodeId = b.slice(0, dotIdx)
  const key = b.slice(dotIdx + 1)
  return `${nodeId} → ${key}`
})

// ─── Vars store helpers ───────────────────────────────────────
const WIDGET_KINDS = ['text', 'input', 'button', 'slider', 'table'] as const
const newKeyName = ref('')

function updateStoreKey(key: string, value: string) {
  if (!props.node) return
  emit('update:ui', { store: { ...props.node.ui.store, [key]: value } })
}
function deleteStoreKey(key: string) {
  if (!props.node) return
  const store = { ...props.node.ui.store }
  delete store[key]
  emit('update:ui', { store })
}
function addStoreKey() {
  const key = newKeyName.value.trim()
  if (!key || !props.node) return
  emit('update:ui', { store: { ...props.node.ui.store, [key]: '' } })
  newKeyName.value = ''
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
.pf-hint { font-size: 11px; color: var(--text-muted); margin-bottom: 2px; }
.pf-hint-ref { color: var(--accent); margin-left: 3px; }
.pf-hint-inline { font-size: 10px; color: var(--text-muted); }

.pf-section-title {
  font-size: 10px;
  color: var(--text-dim);
  letter-spacing: 0.05em;
  margin-bottom: 2px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.pf-row { display: flex; align-items: center; gap: 6px; margin-bottom: 2px; }
.pf-label { font-size: 10px; color: var(--text-muted); min-width: 50px; flex-shrink: 0; }
.pf-cb-label { display: flex; align-items: center; gap: 5px; cursor: pointer; min-width: unset; }

.pf-input {
  flex: 1;
  background: var(--bg-3);
  border: 1px solid var(--border-2);
  border-radius: 3px;
  color: var(--text);
  font-family: inherit;
  font-size: 10px;
  padding: 3px 6px;
  outline: none;
  min-width: 0;
}
.pf-input:focus { border-color: var(--accent); }
.pf-input:disabled { color: var(--text-dim); }
.pf-full { width: 100%; box-sizing: border-box; }
.pf-port-name { min-width: 80px; max-width: 140px; flex: 1; }

.pf-textarea {
  width: 100%;
  background: var(--bg-3);
  border: 1px solid var(--border-2);
  border-radius: 3px;
  color: var(--text);
  font-family: inherit;
  font-size: 10px;
  padding: 4px 6px;
  resize: vertical;
  box-sizing: border-box;
  outline: none;
  line-height: 1.4;
}
.pf-textarea:focus { border-color: var(--accent); }

.pf-del-btn {
  background: none;
  border: none;
  color: var(--text-dim);
  cursor: pointer;
  font-size: 10px;
  padding: 1px 3px;
  flex-shrink: 0;
}
.pf-del-btn:hover { color: var(--red); }

.pf-add-btn {
  background: none;
  border: 1px solid var(--border-2);
  color: var(--text-dim);
  font-family: inherit;
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 3px;
  cursor: pointer;
  margin-top: 2px;
  align-self: flex-start;
}
.pf-add-btn:hover { border-color: var(--accent); color: var(--accent); }
.pf-schema-field { margin-top: 2px; }
.pf-key-label { font-family: 'Berkeley Mono', ui-monospace, monospace; color: var(--purple); min-width: 50px; }
.pf-add-key-row { margin-top: 4px; }
.pf-add-key-btn { padding: 2px 6px; margin-top: 0; }

.pf-widget-kinds { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 2px; }
.pf-kind-btn {
  background: none;
  border: 1px solid var(--border-2);
  color: var(--text-dim);
  font-family: inherit;
  font-size: 10px;
  padding: 2px 7px;
  border-radius: 3px;
  cursor: pointer;
}
.pf-kind-btn:hover { border-color: var(--text-muted); color: var(--text-muted); }
.pf-kind-btn.active { border-color: var(--accent); color: var(--accent); background: var(--accent-bg); }

/* ── Returns schema ──────────────────────────────────────────── */
.pf-returns {
  font-size: 9px;
  color: var(--purple);
  background: var(--purple-bg);
  border: 1px solid var(--purple-bg);
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
.pf-output-ok-title { color: var(--green); }
.pf-output-error-title { color: var(--red); }
.pf-copy-btn {
  background: none;
  border: 1px solid var(--border-2);
  color: var(--text-muted);
  font-size: 11px;
  padding: 1px 5px;
  border-radius: 3px;
  cursor: pointer;
  line-height: 1;
}
.pf-copy-btn:hover { border-color: var(--accent); color: var(--accent); }
.pf-output {
  font-size: 11px;
  color: var(--green);
  background: var(--bg-2);
  border: 1px solid var(--border);
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
.pf-output.pf-output-error { color: var(--red); }

/* ── Mustache preview ──────────────────────────────────────────── */
.pf-template-preview {
  background: var(--bg-3);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text);
  font-family: inherit;
  font-size: 11px;
  padding: 6px 8px;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 120px;
  overflow-y: auto;
  margin-top: 2px;
  user-select: text;
  cursor: text;
}

.pf-var-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0;
  flex-wrap: wrap;
}
.pf-var-name {
  font-family: 'Berkeley Mono', 'Fira Code', ui-monospace, monospace;
  font-size: 10px;
  color: var(--yellow);
  flex-shrink: 0;
}
.pf-var-type {
  font-size: 9px;
  color: var(--accent);
  background: var(--accent-bg);
  border: 1px solid var(--accent-bg-2);
  border-radius: 3px;
  padding: 0 4px;
  flex-shrink: 0;
}
.pf-var-preview {
  font-size: 10px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 160px;
  font-family: 'Berkeley Mono', 'Fira Code', ui-monospace, monospace;
}
.pf-var-unset {
  font-size: 9px;
  color: var(--text-dim);
  font-style: italic;
}
</style>
