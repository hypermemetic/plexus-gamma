<template>
  <div class="method-card" ref="cardRef">
    <!-- Header -->
    <div class="method-header">
      <div class="method-left">
        <code class="method-name">{{ method.name }}</code>
        <div class="method-tags">
          <span v-if="method.streaming"     class="tag stream">stream</span>
          <span v-if="method.bidirectional" class="tag bidir">bidir</span>
        </div>
      </div>
      <p class="method-desc">{{ method.description }}</p>
      <button class="copy-btn" @click="copyState" title="Copy full snapshot">{{ wasCopied('state') ? '✓' : '⎘' }}</button>
    </div>

    <!-- Params section -->
    <div class="params-section" @keydown.ctrl.enter.prevent="invoke">
      <div class="params-header">
        <span class="section-label">params</span>
        <div class="params-header-actions">
          <button v-if="hasParamForm" class="toggle-btn" @click="jsonMode = !jsonMode" :class="{ active: jsonMode }">JSON</button>
          <button v-if="hasParams" class="copy-btn" @click="copyParams" title="Copy params">{{ wasCopied('params') ? '✓' : '⎘' }}</button>
        </div>
      </div>

      <div v-if="!hasParams" class="no-params">no parameters</div>

      <div v-else-if="!jsonMode && hasParamForm" class="param-form" ref="formRef">
        <SchemaField
          name="params"
          :schema="paramSchema!"
          :model-value="formValues"
          @update:model-value="formValues = $event as Record<string, unknown>"
        />
      </div>
      <template v-else-if="hasParams">
        <textarea
          v-model="paramsInput"
          ref="textareaRef"
          class="params-editor"
          placeholder="{}"
          spellcheck="false"
          rows="3"
        />
      </template>

      <div v-if="parseError" class="parse-error">{{ parseError }}</div>
    </div>

    <!-- Call row -->
    <div class="call-row">
      <button
        class="call-btn"
        :class="{ running }"
        :disabled="running"
        @click="invoke"
      >
        <span class="call-path">{{ running ? '◌' : '▶' }} <code>{{ fullPath }}</code></span>
      </button>
      <button v-if="running" class="cancel-btn" @click="cancelFlag = true" title="Stop">◼</button>
      <button v-if="!running" class="inspect-btn" @click="inspectOpen = !inspectOpen" :class="{ active: inspectOpen }" title="Inspect request">{ }</button>
    </div>

    <!-- Inspect panel -->
    <div v-if="inspectOpen" class="inspect-panel">
      <div class="inspect-header">
        <span class="section-label">params</span>
        <div class="inspect-actions">
          <button
            class="toggle-btn"
            :class="{ active: inspectMode === 'sync' }"
            @click="inspectMode = inspectMode === 'sync' ? 'validate' : 'sync'"
            title="Sync edits back to the form"
          >↔ sync</button>
          <button class="toggle-btn" @click="copyInspect">{{ wasCopied('inspect') ? '✓' : 'copy' }}</button>
        </div>
      </div>
      <textarea
        v-model="inspectText"
        class="inspect-textarea"
        spellcheck="false"
        @input="onInspectInput"
        @focus="inspectFocused = true"
        @blur="inspectFocused = false"
      />
      <div v-if="inspectParseError" class="inspect-status iv-error">⚠ {{ inspectParseError }}</div>
      <div v-else-if="inspectValidation" class="inspect-status">
        <span v-if="inspectValidation.unknown.length" class="iv-unknown">unknown: {{ inspectValidation.unknown.join(', ') }}</span>
        <span v-if="inspectValidation.missingRequired.length" class="iv-missing">missing: {{ inspectValidation.missingRequired.join(', ') }}</span>
        <span v-if="!inspectValidation.unknown.length && !inspectValidation.missingRequired.length" class="iv-ok">✓ valid</span>
      </div>
    </div>

    <!-- Returns section (collapsible) -->
    <div class="returns-section">
      <div class="returns-header">
        <button class="returns-toggle" @click="returnsOpen = !returnsOpen">
          <span class="section-label">returns</span>
          <span v-if="dataCount > 0" class="returns-count">{{ dataCount }}</span>
          <span class="returns-icon">{{ returnsOpen ? '▾' : '▸' }}</span>
        </button>
        <div v-if="results.length > 0" class="returns-controls">
          <button class="copy-btn" @click="copyResults" title="Copy all results">{{ wasCopied('results') ? '✓' : '⎘' }}</button>
          <button class="clear-btn" @click="results = []">clear</button>
        </div>
      </div>

      <div v-if="returnsOpen" class="returns-body">
        <div v-if="results.length === 0 && !running" class="returns-empty">—</div>

        <div
          v-for="(r, i) in results"
          :key="i"
          class="result-item"
          :class="r.type"
        >
          <div class="result-row">
            <span class="result-type">{{ r.type }}</span>
            <div class="result-actions">
              <button v-if="r.type === 'data'" class="toggle-btn" @click="r.raw = !r.raw">
                {{ r.raw ? 'pretty' : 'raw' }}
              </button>
              <button class="copy-btn" @click="copyResultItem(i, r)" title="Copy this result">{{ wasCopied(`r${i}`) ? '✓' : '⎘' }}</button>
            </div>
          </div>
          <pre v-if="r.type === 'data'" class="result-json">{{ r.raw ? JSON.stringify(r.content) : JSON.stringify(r.content, null, 2) }}</pre>
          <span v-else-if="r.type === 'progress'" class="result-message">
            {{ r.message }}<span v-if="r.percentage !== undefined" class="result-pct"> {{ r.percentage.toFixed(0) }}%</span>
          </span>
          <span v-else-if="r.type === 'error'" class="result-message">
            {{ r.message }}<span v-if="r.code" class="result-code"> [{{ r.code }}]</span>
          </span>
          <span v-else-if="r.type === 'done'" class="result-message">✓ done</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject, watch, nextTick, type Ref } from 'vue'
import { useContainedFocus } from '../lib/useContainedFocus'
import type { PlexusRpcClient } from '../lib/plexus/transport'
import type { MethodSchema } from '../plexus-schema'
import SchemaField from './SchemaField.vue'
import type { JsonSchema } from './SchemaField.vue'
import { useFormEnterNav } from '../lib/useFormEnterNav'

const props = defineProps<{
  method: MethodSchema
  namespace: string
  backendName: string
}>()

const { focus } = useContainedFocus()
const rpc           = inject<PlexusRpcClient>('rpc')!
const pendingMethod = inject<Ref<string | null>>('pendingMethod', ref(null))

const jsonMode     = ref(false)
const paramsInput  = ref('{}')
const parseError   = ref('')
const running      = ref(false)
const cancelFlag   = ref(false)
const returnsOpen  = ref(false)
const inspectOpen    = ref(false)
const inspectMode    = ref<'validate' | 'sync'>('validate')
const inspectText    = ref('')
const inspectFocused = ref(false)
const inspectParseError = ref('')
const copiedKey      = ref<string | null>(null)
const updatingFromInspect = ref(false)

const cardRef      = ref<HTMLElement | null>(null)
const formRef      = ref<HTMLElement | null>(null)
const textareaRef  = ref<HTMLTextAreaElement | null>(null)
const resultsPanel = ref<HTMLElement | null>(null)
const formValues   = ref<Record<string, unknown>>({})

interface ResultItem {
  type: 'data' | 'progress' | 'error' | 'done'
  content?: unknown
  message?: string
  percentage?: number
  code?: string
  raw?: boolean
}
const results = ref<ResultItem[]>([])

const fullPath = computed(() => {
  const ns = props.namespace === '' ? props.backendName : props.namespace
  return `${ns}.${props.method.name}`
})

// Key transformations — mirror what the RPC transport does on ingress,
// and reverse it on egress so the backend receives snake_case.
function toCamelCase(s: string): string {
  return s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
}
function toSnakeCase(s: string): string {
  return s.replace(/([A-Z])/g, (_, c: string) => '_' + c.toLowerCase())
}
function keysToSnake(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj
  if (typeof obj !== 'object') return obj
  if (Array.isArray(obj)) return obj.map(keysToSnake)
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj as Record<string, unknown>))
    out[toSnakeCase(k)] = keysToSnake(v)
  return out
}

function resolveRefs(
  schema: JsonSchema & { $ref?: string },
  defs: Record<string, JsonSchema>,
): JsonSchema {
  if (schema.$ref) {
    const name = schema.$ref.replace(/^#\/\$defs\//, '')
    const resolved = defs[name]
    return resolved ? resolveRefs(resolved, defs) : schema
  }
  const s = { ...schema }
  if (s.properties)
    s.properties = Object.fromEntries(
      Object.entries(s.properties).map(([k, v]) => [k, resolveRefs(v as JsonSchema & { $ref?: string }, defs)])
    )
  if (s.required)
    s.required = s.required.map(toCamelCase)
  if (s.items) s.items = resolveRefs(s.items as JsonSchema & { $ref?: string }, defs)
  if (s.anyOf) s.anyOf = s.anyOf.map(x => resolveRefs(x as JsonSchema & { $ref?: string }, defs))
  if (s.oneOf) s.oneOf = s.oneOf.map(x => resolveRefs(x as JsonSchema & { $ref?: string }, defs))
  return s
}

const paramSchema = computed<JsonSchema | null>(() => {
  const p = props.method.params
  if (!p || typeof p !== 'object') return null
  const raw = p as JsonSchema & { $defs?: Record<string, JsonSchema> }
  const defs = raw.$defs ?? {}
  return resolveRefs(raw, defs)
})

const hasParamForm = computed(() => {
  const s = paramSchema.value
  return s !== null && s.type === 'object' && !!s.properties
})

const hasParams = computed(() => paramSchema.value !== null)

const dataCount = computed(() => results.value.filter(r => r.type === 'data').length)

// Returns the current params in snake_case — the actual outbound format.
function currentParams(): unknown {
  if (!jsonMode.value && hasParamForm.value) return keysToSnake(formValues.value)
  if (hasParams.value) {
    const raw = paramsInput.value.trim()
    if (raw && raw !== '{}') {
      try { return JSON.parse(raw) } catch { /* fall through */ }
    }
  }
  return {}
}

interface InspectValidation { unknown: string[]; missingRequired: string[] }

// Inspect panel works in snake_case (matches the wire format).
// Schema property keys are camelCase (post-transformKeys) so we convert them.
const inspectValidation = computed<InspectValidation | null>(() => {
  if (!inspectText.value.trim() || inspectParseError.value) return null
  let parsed: unknown
  try { parsed = JSON.parse(inspectText.value) } catch { return null }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
  const obj = parsed as Record<string, unknown>
  const schema = paramSchema.value
  // Convert camelCase schema keys → snake_case for comparison with inspect JSON
  const knownKeys = schema?.properties
    ? new Set(Object.keys(schema.properties).map(toSnakeCase))
    : null
  const required = (schema?.required ?? []).map(toSnakeCase)
  return {
    unknown: knownKeys ? Object.keys(obj).filter(k => !knownKeys.has(k)) : [],
    missingRequired: required.filter(k => !(k in obj)),
  }
})

// Open: seed the textarea from the current form state
watch(inspectOpen, (open) => {
  if (open) {
    inspectText.value = JSON.stringify(currentParams(), null, 2)
    inspectParseError.value = ''
  }
})

// Form → inspect: live update whenever the textarea isn't focused
// In sync mode, unknown keys typed into the textarea are preserved.
// In validate mode, the textarea is replaced outright (user isn't editing it).
watch(formValues, () => {
  if (!inspectOpen.value || updatingFromInspect.value || inspectFocused.value) return
  // Inspect always shows snake_case (wire format)
  let merged = keysToSnake(formValues.value) as Record<string, unknown>
  if (inspectMode.value === 'sync') {
    // Preserve unknown (snake_case) keys the user typed into the inspect panel
    try {
      const cur = JSON.parse(inspectText.value) as Record<string, unknown>
      const knownSnake = paramSchema.value?.properties
        ? new Set(Object.keys(paramSchema.value.properties).map(toSnakeCase))
        : null
      for (const [k, v] of Object.entries(cur))
        if (!knownSnake || !knownSnake.has(k)) merged[k] = v
    } catch { /* ignore */ }
  }
  inspectText.value = JSON.stringify(merged, null, 2)
  inspectParseError.value = ''
}, { deep: true })

function onInspectInput() {
  inspectParseError.value = ''
  const text = inspectText.value.trim()
  if (!text) return
  let parsed: unknown
  try { parsed = JSON.parse(text) }
  catch (e) { inspectParseError.value = e instanceof Error ? e.message : 'Invalid JSON'; return }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    inspectParseError.value = 'Expected a JSON object'; return
  }
  if (inspectMode.value !== 'sync' || !hasParamForm.value) return
  // Sync mode (A): inspect is snake_case → convert to camelCase for formValues
  const obj = parsed as Record<string, unknown>
  const knownKeysCamel = paramSchema.value?.properties
    ? new Set(Object.keys(paramSchema.value.properties))
    : null
  updatingFromInspect.value = true
  const next: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    const camel = toCamelCase(k)
    if (!knownKeysCamel || knownKeysCamel.has(camel)) next[camel] = v
  }
  formValues.value = next
  nextTick(() => { updatingFromInspect.value = false })
}

function copyTo(key: string, text: string) {
  navigator.clipboard.writeText(text).then(() => {
    copiedKey.value = key
    setTimeout(() => { if (copiedKey.value === key) copiedKey.value = null }, 1500)
  })
}

function wasCopied(key: string): boolean {
  return copiedKey.value === key
}

function copyParams() {
  copyTo('params', JSON.stringify(currentParams(), null, 2))
}

function copyResults() {
  const data = results.value.filter(r => r.type === 'data').map(r => r.content)
  copyTo('results', JSON.stringify(data.length === 1 ? data[0] : data, null, 2))
}

function copyResultItem(i: number, r: ResultItem) {
  const text = r.type === 'data'
    ? JSON.stringify(r.content, null, 2)
    : (r.message ?? JSON.stringify(r))
  copyTo(`r${i}`, text)
}

function copyState() {
  const snapshot = {
    method: fullPath.value,
    params: currentParams(),
    results: results.value.map(r =>
      r.type === 'data'
        ? { type: r.type, content: r.content }
        : { type: r.type, message: r.message }
    ),
  }
  copyTo('state', JSON.stringify(snapshot, null, 2))
}

function copyInspect() {
  let params: unknown
  try { params = JSON.parse(inspectText.value) } catch { params = inspectText.value }
  copyTo('inspect', JSON.stringify({ method: fullPath.value, params }, null, 2))
}

useFormEnterNav(formRef, invoke)

// Auto-focus first input when params form is ready (on pending method open)
watch(() => props.method.name, () => {
  nextTick(() => focus(formRef.value?.querySelector<HTMLElement>('input, select, textarea')))
})

// Auto-scroll results panel
watch(results, () => {
  nextTick(() => {
    if (resultsPanel.value) resultsPanel.value.scrollTop = resultsPanel.value.scrollHeight
  })
}, { deep: true })

// Auto-open returns when results arrive
watch(() => results.value.length, (n) => {
  if (n > 0) returnsOpen.value = true
})

// Auto-focus when pending method matches (immediate: catches case where pendingMethod
// was already set before this component mounted)
watch(pendingMethod, (method) => {
  if (method !== null && method === fullPath.value) {
    pendingMethod.value = null
    nextTick(() => {
      const input = formRef.value?.querySelector<HTMLElement>('input, select, textarea')
        ?? textareaRef.value
      focus(input)
      cardRef.value?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  }
}, { immediate: true })

async function invoke() {
  parseError.value = ''
  let params: unknown = {}

  if (!jsonMode.value && hasParamForm.value) {
    params = keysToSnake(formValues.value)
  } else if (hasParams.value) {
    const raw = paramsInput.value.trim()
    if (raw && raw !== '{}') {
      try { params = JSON.parse(raw) }
      catch (e) { parseError.value = `Invalid JSON: ${e instanceof Error ? e.message : e}`; return }
    }
  }

  results.value = []
  running.value = true
  cancelFlag.value = false
  returnsOpen.value = true
  try {
    for await (const item of rpc.call(fullPath.value, params)) {
      if (cancelFlag.value) break
      if (item.type === 'data') {
        results.value.push({ type: 'data', content: item.content, raw: false })
      } else if (item.type === 'progress') {
        results.value.push({ type: 'progress', message: item.message, percentage: item.percentage ?? undefined })
      } else if (item.type === 'error') {
        results.value.push({ type: 'error', message: item.message, code: item.code ?? undefined })
        break
      } else if (item.type === 'done') {
        results.value.push({ type: 'done' })
        break
      }
    }
  } catch (e) {
    results.value.push({ type: 'error', message: e instanceof Error ? e.message : String(e) })
  } finally {
    running.value = false
    cancelFlag.value = false
  }
}
</script>

<style scoped>
.method-card {
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* Header */
.method-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.method-left { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.method-name { color: #d2a8ff; font-size: 13px; }
.method-tags { display: flex; gap: 5px; }
.tag { font-size: 10px; padding: 1px 6px; border-radius: 8px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
.tag.stream { background: var(--accent-bg); color: var(--accent); }
.tag.bidir  { background: var(--purple-bg); color: #bc8cff; }
.method-desc { color: var(--text-muted); margin: 0; line-height: 1.5; font-size: 12px; flex: 1; }

/* Section label */
.section-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-dim);
}

/* Params */
.params-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px 10px;
  background: var(--bg-2);
}

.params-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.no-params {
  font-size: 11px;
  color: var(--border-2);
  font-style: italic;
}

.param-form { display: flex; flex-direction: column; gap: 4px; }

.params-editor {
  width: 100%;
  background: var(--bg-2);
  border: 1px solid var(--border-2);
  border-radius: 4px;
  color: var(--text);
  font-family: inherit;
  font-size: 12px;
  padding: 6px 8px;
  resize: vertical;
  box-sizing: border-box;
  outline: none;
  line-height: 1.5;
}
.params-editor:focus { border-color: var(--accent); }
.parse-error { color: var(--red); font-size: 11px; }

/* Call row */
.call-row {
  display: flex;
  gap: 6px;
  align-items: stretch;
}

.call-btn {
  background: var(--accent-bg);
  border: 1px solid var(--accent-bg-2);
  color: var(--accent);
  font-size: 11px;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-family: inherit;
  flex: 1;
  text-align: left;
}
.call-btn:hover:not(:disabled) { background: var(--accent-bg-2); }
.call-btn:disabled { opacity: 0.6; cursor: default; }
.call-btn.running { color: var(--text-muted); }
.call-path { display: flex; align-items: center; gap: 6px; }
.call-path code { color: var(--accent-2); font-weight: 400; font-size: 11px; }
.call-btn.running .call-path code { color: var(--text-dim); }

.cancel-btn {
  background: var(--red-bg); border: 1px solid var(--red-bg); color: var(--red);
  font-size: 12px; padding: 5px 10px; border-radius: 4px;
  cursor: pointer; font-family: inherit; flex-shrink: 0;
}
.cancel-btn:hover { background: var(--red-bg); }

.inspect-btn {
  background: none; border: 1px solid var(--border-2); color: var(--text-dim);
  font-size: 11px; padding: 5px 8px; border-radius: 4px;
  cursor: pointer; font-family: inherit; flex-shrink: 0; letter-spacing: 0.05em;
}
.inspect-btn:hover { border-color: var(--text-muted); color: var(--text-muted); }
.inspect-btn.active { border-color: var(--accent); color: var(--accent); background: var(--accent-bg); }

.inspect-panel {
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-2);
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.inspect-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.inspect-actions { display: flex; gap: 4px; }

.inspect-textarea {
  width: 100%;
  background: var(--bg-2);
  border: 1px solid var(--border-2);
  border-radius: 4px;
  color: var(--text);
  font-family: inherit;
  font-size: 11px;
  padding: 6px 8px;
  resize: vertical;
  box-sizing: border-box;
  outline: none;
  line-height: 1.5;
  min-height: 80px;
}
.inspect-textarea:focus { border-color: var(--accent); }

.inspect-status {
  display: flex;
  gap: 8px;
  font-size: 10px;
  flex-wrap: wrap;
}
.iv-ok      { color: var(--green); }
.iv-error   { color: var(--red); font-size: 10px; }
.iv-unknown { color: var(--red); }
.iv-missing { color: var(--yellow); }

/* Returns */
.returns-section {
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
}

.returns-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--bg-2);
  border: none;
  cursor: pointer;
  font-family: inherit;
  text-align: left;
}
.returns-toggle:hover { background: var(--bg-3); }

.returns-count {
  font-size: 10px;
  background: var(--border);
  color: var(--text-muted);
  border-radius: 8px;
  padding: 0 5px;
  line-height: 1.6;
}

.returns-icon { font-size: 10px; color: var(--text-dim); margin-left: auto; }

.returns-body {
  border-top: 1px solid var(--border);
  max-height: 360px;
  overflow-y: auto;
}

.returns-empty {
  padding: 10px 12px;
  font-size: 11px;
  color: var(--border-2);
}

.result-item {
  padding: 6px 10px;
  border-bottom: 1px solid var(--border);
  font-size: 11px;
}
.result-item:last-child { border-bottom: none; }

.result-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 2px;
}

.result-actions { display: flex; gap: 4px; }

.result-type { font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; }
.result-item.data     { background: var(--bg-2); }
.result-item.data     .result-type { color: var(--green); }
.result-item.progress { background: var(--bg-3); }
.result-item.progress .result-type { color: var(--accent); }
.result-item.error    { background: var(--red-bg); }
.result-item.error    .result-type { color: var(--red); }
.result-item.done     { background: var(--bg-3); }
.result-item.done     .result-type { color: var(--green); }

.result-json { margin: 4px 0 0; color: var(--text); line-height: 1.5; white-space: pre-wrap; word-break: break-all; }
.result-message { color: var(--text); }
.result-pct { color: var(--accent); }
.result-code { color: var(--red); }

/* Shared small buttons */
.toggle-btn {
  background: none; border: 1px solid var(--border-2); color: var(--text-muted);
  font-size: 10px; padding: 1px 6px; border-radius: 4px;
  cursor: pointer; font-family: inherit;
}
.toggle-btn:hover { border-color: var(--accent); color: var(--accent); }
.toggle-btn.active { border-color: var(--accent); color: var(--accent); background: var(--accent-bg); }

.clear-btn {
  background: none; border: 1px solid var(--border-2); color: var(--text-dim);
  font-size: 10px; padding: 1px 6px; border-radius: 4px; cursor: pointer; font-family: inherit;
}
.clear-btn:hover { border-color: var(--text-dim); color: var(--text-muted); }

.copy-btn {
  background: none; border: 1px solid var(--border-2); color: var(--text-dim);
  font-size: 11px; padding: 1px 6px; border-radius: 4px; cursor: pointer; font-family: inherit;
  line-height: 1.4;
}
.copy-btn:hover { border-color: var(--text-muted); color: var(--text-muted); }

.params-header-actions { display: flex; gap: 4px; align-items: center; }

.returns-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--bg-2);
}
.returns-controls { display: flex; gap: 4px; align-items: center; padding-right: 8px; }
</style>
