<template>
  <div class="method-card">
    <!-- Header row: name + tags + description -->
    <div class="method-header">
      <div class="method-left">
        <code class="method-name">{{ method.name }}</code>
        <div class="method-tags">
          <span v-if="method.streaming"     class="tag stream">stream</span>
          <span v-if="method.bidirectional" class="tag bidir">bidir</span>
        </div>
      </div>
      <p class="method-desc">{{ method.description }}</p>
    </div>

    <!-- Schema blocks: always visible -->
    <div v-if="method.params" class="schema-block">
      <div class="schema-block-header">
        <span class="schema-label">params</span>
        <button class="toggle-btn" @click="rawParams = !rawParams">{{ rawParams ? 'pretty' : 'raw' }}</button>
      </div>
      <pre class="schema-json">{{ rawParams ? JSON.stringify(method.params) : JSON.stringify(method.params, null, 2) }}</pre>
    </div>

    <div v-if="method.returns" class="schema-block">
      <div class="schema-block-header">
        <span class="schema-label">returns</span>
        <button class="toggle-btn" @click="rawReturns = !rawReturns">{{ rawReturns ? 'pretty' : 'raw' }}</button>
      </div>
      <pre class="schema-json">{{ rawReturns ? JSON.stringify(method.returns) : JSON.stringify(method.returns, null, 2) }}</pre>
    </div>

    <!-- Invoke section: collapsible -->
    <div class="invoke-toggle" @click="invokeOpen = !invokeOpen">
      <span class="invoke-toggle-icon">{{ invokeOpen ? '▾' : '▸' }}</span>
      <span class="invoke-toggle-label">call  <code class="full-path">{{ fullPath }}</code></span>
    </div>

    <div v-if="invokeOpen" class="invoke-body">
      <div class="invoke-actions">
        <button v-if="results.length" class="clear-btn" @click="results = []">clear</button>
        <button
          class="call-btn"
          :class="{ running }"
          :disabled="running"
          @click="invoke"
        >{{ running ? '◌ running…' : '▶ call' }}</button>
      </div>

      <textarea
        v-model="paramsInput"
        class="params-editor"
        placeholder="{}"
        spellcheck="false"
        rows="3"
      />
      <div v-if="parseError" class="parse-error">{{ parseError }}</div>

      <div v-if="results.length" class="results-panel">
        <div
          v-for="(r, i) in results"
          :key="i"
          class="result-item"
          :class="r.type"
        >
          <div class="result-row">
            <span class="result-type">{{ r.type }}</span>
            <button v-if="r.type === 'data'" class="toggle-btn" @click="r.raw = !r.raw">
              {{ r.raw ? 'pretty' : 'raw' }}
            </button>
          </div>
          <pre v-if="r.type === 'data'" class="result-json">{{ r.raw ? JSON.stringify(r.content) : JSON.stringify(r.content, null, 2) }}</pre>
          <span v-else-if="r.type === 'progress'" class="result-message">
            {{ r.message }}<span v-if="r.percentage !== undefined" class="result-pct"> {{ r.percentage.toFixed(0) }}%</span>
          </span>
          <span v-else-if="r.type === 'error'" class="result-message">
            {{ r.message }}<span v-if="r.code" class="result-code"> [{{ r.code }}]</span>
          </span>
          <span v-else-if="r.type === 'done'" class="result-message">✓ completed</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject } from 'vue'
import type { PlexusRpcClient } from '../lib/plexus/transport'
import type { MethodSchema } from '../plexus-schema'

const props = defineProps<{
  method: MethodSchema
  namespace: string    // e.g. "echo", "solar.earth", or "" for root
  backendName: string  // e.g. "substrate"
}>()

const rpc = inject<PlexusRpcClient>('rpc')!

const rawParams   = ref(false)
const rawReturns  = ref(false)
const invokeOpen  = ref(false)
const paramsInput = ref('{}')
const parseError  = ref('')
const running     = ref(false)

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

async function invoke() {
  parseError.value = ''
  let params: unknown = {}
  if (paramsInput.value.trim() && paramsInput.value.trim() !== '{}') {
    try { params = JSON.parse(paramsInput.value) }
    catch (e) { parseError.value = `Invalid JSON: ${e instanceof Error ? e.message : e}`; return }
  }

  results.value = []
  running.value = true
  try {
    for await (const item of rpc.call(fullPath.value, params)) {
      if (item.type === 'data') {
        results.value.push({ type: 'data', content: item.content, raw: false })
      } else if (item.type === 'progress') {
        results.value.push({ type: 'progress', message: item.message, percentage: item.percentage })
      } else if (item.type === 'error') {
        results.value.push({ type: 'error', message: item.message, code: item.code })
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
  }
}
</script>

<style scoped>
.method-card {
  background: #111114;
  border: 1px solid #21262d;
  border-radius: 8px;
  padding: 14px 16px;
}

.method-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 4px;
  gap: 12px;
}

.method-left { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

.method-name { color: #d2a8ff; font-size: 13px; }

.method-tags { display: flex; gap: 5px; }
.tag { font-size: 10px; padding: 1px 6px; border-radius: 8px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
.tag.stream { background: #1a2840; color: #58a6ff; }
.tag.bidir  { background: #271a3a; color: #bc8cff; }

.method-desc { color: #8b949e; margin: 0; line-height: 1.5; font-size: 12px; flex: 1; }

/* Schema blocks */
.schema-block { margin-top: 10px; }

.schema-block-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.schema-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #484f58;
}

.toggle-btn {
  background: none;
  border: 1px solid #30363d;
  color: #8b949e;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  cursor: pointer;
  font-family: inherit;
}
.toggle-btn:hover { border-color: #58a6ff; color: #58a6ff; }

.schema-json {
  background: #0d1117;
  border: 1px solid #21262d;
  border-radius: 6px;
  padding: 10px 12px;
  font-size: 11px;
  color: #c9d1d9;
  overflow-x: auto;
  margin: 0;
  line-height: 1.5;
  max-height: 180px;
  overflow-y: auto;
}

/* Invoke section */
.invoke-toggle {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
  padding: 4px 0;
}
.invoke-toggle:hover .invoke-toggle-label { color: #c9d1d9; }
.invoke-toggle-icon { color: #484f58; font-size: 10px; width: 10px; }
.invoke-toggle-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: #484f58; }
.full-path { color: #79c0ff; font-size: 10px; margin-left: 4px; text-transform: none; letter-spacing: 0; }

.invoke-body { margin-top: 8px; }

.invoke-actions { display: flex; gap: 6px; align-items: center; margin-bottom: 6px; justify-content: flex-end; }

.clear-btn {
  background: none; border: 1px solid #30363d; color: #8b949e;
  font-size: 11px; padding: 2px 8px; border-radius: 4px; cursor: pointer; font-family: inherit;
}
.clear-btn:hover { border-color: #484f58; }

.call-btn {
  background: #1a2840; border: 1px solid #1f3a5f; color: #58a6ff;
  font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 4px;
  cursor: pointer; font-family: inherit;
}
.call-btn:hover:not(:disabled) { background: #1f3a5f; }
.call-btn:disabled { opacity: 0.6; cursor: default; }
.call-btn.running { color: #8b949e; }

.params-editor {
  width: 100%;
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 6px;
  color: #c9d1d9;
  font-family: inherit;
  font-size: 12px;
  padding: 8px 10px;
  resize: vertical;
  box-sizing: border-box;
  outline: none;
  line-height: 1.5;
}
.params-editor:focus { border-color: #58a6ff; }

.parse-error { color: #f85149; font-size: 11px; margin-top: 4px; }

.results-panel {
  margin-top: 8px;
  border: 1px solid #21262d;
  border-radius: 6px;
  overflow: hidden;
  max-height: 360px;
  overflow-y: auto;
}

.result-item {
  padding: 6px 10px;
  border-bottom: 1px solid #21262d;
  font-size: 11px;
}
.result-item:last-child { border-bottom: none; }

.result-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px; }

.result-type { font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; }

.result-item.data     { background: #0d1117; }
.result-item.data     .result-type { color: #3fb950; }
.result-item.progress { background: #0f1420; }
.result-item.progress .result-type { color: #58a6ff; }
.result-item.error    { background: #2d1117; }
.result-item.error    .result-type { color: #f85149; }
.result-item.done     { background: #111714; }
.result-item.done     .result-type { color: #3fb950; }

.result-json { margin: 4px 0 0; color: #c9d1d9; line-height: 1.5; white-space: pre-wrap; word-break: break-all; }
.result-message { color: #c9d1d9; }
.result-pct { color: #58a6ff; }
.result-code { color: #f85149; }
</style>
