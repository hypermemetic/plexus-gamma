<template>
  <!-- Collapsed toggle button -->
  <button v-if="!open" class="batch-toggle" @click="open = true" title="Open Batch Runner">
    ⊞ Batch
  </button>

  <!-- Expanded panel -->
  <div v-else class="batch-panel">
    <!-- Header row -->
    <div class="batch-header">
      <span class="batch-title">Batch</span>
      <div class="batch-controls">
        <label class="concurrency-label">Concurrency:</label>
        <input
          v-model.number="concurrency"
          type="number"
          class="concurrency-input"
          min="1"
          max="20"
          :disabled="running"
        />
        <button
          v-if="!running"
          class="run-btn"
          :disabled="parsedItems === null || parsedItems.length === 0"
          @click="runBatch"
        >
          ▶ Run{{ parsedItems !== null ? ` ${parsedItems.length} item${parsedItems.length !== 1 ? 's' : ''}` : '' }}
        </button>
        <button v-if="running" class="stop-btn" @click="stopFlag = true">
          ◼ Stop
        </button>
        <button class="close-btn" @click="closePanel" title="Close">✕ Close</button>
      </div>
    </div>

    <!-- Input area -->
    <div class="batch-input-section">
      <div class="batch-input-label">Input (JSON array of param objects):</div>
      <textarea
        v-model="inputText"
        class="batch-textarea"
        spellcheck="false"
        :rows="6"
        placeholder='[ { "key": "value" }, { "key": "other" } ]'
        :disabled="running"
      />
      <div v-if="parseError" class="batch-parse-error">{{ parseError }}</div>
      <div v-else-if="parsedItems !== null" class="batch-item-count">
        {{ parsedItems.length }} valid item{{ parsedItems.length !== 1 ? 's' : '' }}
        <span class="count-check">✓</span>
      </div>
    </div>

    <!-- Results table -->
    <div v-if="rows.length > 0" class="batch-results">
      <table class="batch-table">
        <thead>
          <tr>
            <th class="col-index">#</th>
            <th class="col-params">params</th>
            <th class="col-status">status</th>
            <th class="col-result">result</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in rows"
            :key="row.index"
            class="batch-row"
            :class="row.status"
          >
            <td class="col-index">{{ row.index }}</td>
            <td class="col-params">
              <code class="params-inline">{{ formatInline(row.params) }}</code>
            </td>
            <td class="col-status">
              <span class="status-icon" :class="row.status">{{ statusIcon(row.status) }}</span>
              <span class="status-text" :class="row.status">{{ row.status }}</span>
              <span v-if="row.durationMs > 0 && row.status === 'done'" class="duration-text">
                {{ row.durationMs }}ms
              </span>
            </td>
            <td class="col-result">
              <template v-if="row.status === 'error'">
                <span class="error-message">{{ row.error }}</span>
              </template>
              <template v-else-if="row.status === 'done' && row.result !== null">
                <div class="result-cell">
                  <code class="result-inline">{{ formatInline(row.result) }}</code>
                  <button
                    class="expand-btn"
                    :class="{ active: expandedRows.has(row.index) }"
                    @click="toggleExpand(row.index)"
                    title="Expand result"
                  >▾</button>
                </div>
                <pre v-if="expandedRows.has(row.index)" class="result-expanded">{{ JSON.stringify(row.result, null, 2) }}</pre>
              </template>
              <template v-else-if="row.status === 'running'">
                <span class="running-indicator">…</span>
              </template>
              <template v-else>
                <span class="pending-dash">—</span>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Footer summary -->
    <div v-if="rows.length > 0" class="batch-footer">
      <span class="footer-summary">
        {{ doneCount }}/{{ rows.length }} done
        <span v-if="errorCount > 0" class="footer-errors">&nbsp; {{ errorCount }} error{{ errorCount !== 1 ? 's' : '' }}</span>
      </span>
      <button
        v-if="doneCount > 0 || errorCount > 0"
        class="copy-results-btn"
        @click="copyAllResults"
      >
        {{ wasCopied ? '✓ copied' : '⎘ copy all results' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject } from 'vue'
import type { PlexusRpcClient } from '../../lib/plexus/transport'
import type { MethodSchema } from '../../plexus-schema'

const props = defineProps<{
  method: MethodSchema
  namespace: string
  backendName: string
}>()

const rpc = inject<PlexusRpcClient>('rpc')!

// ── Panel state ────────────────────────────────────────────────────────────
const open        = ref(false)
const inputText   = ref('')
const concurrency = ref(4)
const running     = ref(false)
const stopFlag    = ref(false)
const wasCopied   = ref(false)
const expandedRows = ref<Set<number>>(new Set())

// ── Data model ─────────────────────────────────────────────────────────────
interface BatchRow {
  index:      number
  params:     unknown
  status:     'pending' | 'running' | 'done' | 'error'
  result:     unknown
  error:      string
  durationMs: number
}

const rows = ref<BatchRow[]>([])

// ── Input parsing ──────────────────────────────────────────────────────────
const parseError = ref('')

const parsedItems = computed<unknown[] | null>(() => {
  const text = inputText.value.trim()
  if (!text) { parseError.value = ''; return null }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (e) {
    parseError.value = `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`
    return null
  }
  if (!Array.isArray(parsed)) {
    parseError.value = 'Expected a JSON array'
    return null
  }
  const nonObjects = parsed.filter(item => typeof item !== 'object' || item === null || Array.isArray(item))
  if (nonObjects.length > 0) {
    parseError.value = `All items must be objects (found ${nonObjects.length} non-object item${nonObjects.length !== 1 ? 's' : ''})`
    return null
  }
  parseError.value = ''
  return parsed
})

// ── Computed counts ────────────────────────────────────────────────────────
const doneCount = computed(() => rows.value.filter(r => r.status === 'done').length)
const errorCount = computed(() => rows.value.filter(r => r.status === 'error').length)

// ── Full method path ───────────────────────────────────────────────────────
const fullPath = computed(() => {
  const ns = props.namespace === '' ? props.backendName : props.namespace
  return `${ns}.${props.method.name}`
})

// ── Helpers ────────────────────────────────────────────────────────────────
function statusIcon(status: BatchRow['status']): string {
  switch (status) {
    case 'pending': return '○'
    case 'running': return '⟳'
    case 'done':    return '✓'
    case 'error':   return '✗'
  }
}

function formatInline(value: unknown): string {
  const s = JSON.stringify(value)
  if (s === undefined) return ''
  return s.length > 80 ? s.slice(0, 77) + '…' : s
}

function toggleExpand(index: number): void {
  const next = new Set(expandedRows.value)
  if (next.has(index)) {
    next.delete(index)
  } else {
    next.add(index)
  }
  expandedRows.value = next
}

function closePanel(): void {
  if (running.value) stopFlag.value = true
  open.value = false
  rows.value = []
  expandedRows.value = new Set()
  wasCopied.value = false
}

// ── Copy all results ───────────────────────────────────────────────────────
function copyAllResults(): void {
  const doneRows = rows.value.filter(r => r.status === 'done')
  const payload = doneRows.map(r => ({ params: r.params, result: r.result }))
  navigator.clipboard.writeText(JSON.stringify(payload, null, 2)).then(() => {
    wasCopied.value = true
    setTimeout(() => { wasCopied.value = false }, 1500)
  })
}

// ── Single-row runner ──────────────────────────────────────────────────────
async function runRow(row: BatchRow): Promise<void> {
  row.status = 'running'
  const startMs = Date.now()
  try {
    const stream = rpc.call(fullPath.value, row.params)
    for await (const item of stream) {
      if (stopFlag.value) {
        row.status = 'error'
        row.error  = 'Stopped by user'
        row.durationMs = Date.now() - startMs
        return
      }
      if (item.type === 'data') {
        row.result     = item.content
        row.status     = 'done'
        row.durationMs = Date.now() - startMs
        return
      } else if (item.type === 'error') {
        row.status     = 'error'
        row.error      = item.message + (item.code ? ` [${item.code}]` : '')
        row.durationMs = Date.now() - startMs
        return
      } else if (item.type === 'done') {
        // No data received — treat as done with null result
        row.status     = 'done'
        row.result     = null
        row.durationMs = Date.now() - startMs
        return
      }
      // 'progress' items: continue loop
    }
    // Stream ended without data/done/error
    row.status     = 'done'
    row.result     = null
    row.durationMs = Date.now() - startMs
  } catch (e) {
    row.status     = 'error'
    row.error      = e instanceof Error ? e.message : String(e)
    row.durationMs = Date.now() - startMs
  }
}

// ── Semaphore-based batch runner ────────────────────────────────────────────
async function runBatch(): Promise<void> {
  const items = parsedItems.value
  if (items === null || items.length === 0) return

  // Initialise rows
  rows.value = items.map((params, index) => ({
    index,
    params,
    status:     'pending' as const,
    result:     null,
    error:      '',
    durationMs: 0,
  }))
  expandedRows.value = new Set()
  running.value      = true
  stopFlag.value     = false

  const limit = Math.max(1, Math.min(20, concurrency.value))

  // Process using a queue + active-slot pattern
  let nextIndex = 0
  const allRows = rows.value

  async function worker(): Promise<void> {
    while (true) {
      if (stopFlag.value) break
      const i = nextIndex
      if (i >= allRows.length) break
      nextIndex++
      const row = allRows[i]
      if (row === undefined) break
      await runRow(row)
      if (stopFlag.value) break
    }
  }

  const workers: Promise<void>[] = []
  for (let w = 0; w < limit; w++) {
    workers.push(worker())
  }
  await Promise.all(workers)

  // Mark any remaining pending rows as error if stopped
  if (stopFlag.value) {
    for (const row of allRows) {
      if (row.status === 'pending') {
        row.status = 'error'
        row.error  = 'Stopped before running'
      }
    }
  }

  running.value  = false
  stopFlag.value = false
}
</script>

<style scoped>
/* ── Collapsed toggle button ──────────────────────────────────────────── */
.batch-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: var(--bg-3);
  border: 1px solid var(--border-2);
  color: var(--text-muted);
  font-size: 11px;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-family: inherit;
  transition: border-color 0.1s, color 0.1s;
  margin-top: 6px;
}
.batch-toggle:hover {
  border-color: var(--accent);
  color: var(--accent);
}

/* ── Panel ────────────────────────────────────────────────────────────── */
.batch-panel {
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 0;
  overflow: hidden;
  margin-top: 6px;
}

/* ── Header ───────────────────────────────────────────────────────────── */
.batch-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg-0);
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}

.batch-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-dim);
  flex-shrink: 0;
}

.batch-controls {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.concurrency-label {
  font-size: 11px;
  color: var(--text-dim);
}

.concurrency-input {
  width: 48px;
  background: var(--bg-2);
  border: 1px solid var(--border-2);
  border-radius: 4px;
  color: var(--text);
  font-family: inherit;
  font-size: 11px;
  padding: 2px 5px;
  text-align: center;
  outline: none;
}
.concurrency-input:focus { border-color: var(--accent); }
.concurrency-input:disabled { opacity: 0.5; }

.run-btn {
  background: var(--accent-bg);
  border: 1px solid var(--accent-bg-2);
  color: var(--accent);
  font-size: 11px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;
}
.run-btn:hover:not(:disabled) { background: var(--accent-bg-2); }
.run-btn:disabled { opacity: 0.4; cursor: default; }

.stop-btn {
  background: var(--red-bg);
  border: 1px solid #3d2121;
  color: var(--red);
  font-size: 11px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-family: inherit;
}
.stop-btn:hover { background: #3d1a1a; }

.close-btn {
  background: none;
  border: 1px solid var(--border-2);
  color: var(--text-dim);
  font-size: 11px;
  padding: 3px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-family: inherit;
  margin-left: auto;
}
.close-btn:hover { border-color: var(--text-muted); color: var(--text-muted); }

/* ── Input section ────────────────────────────────────────────────────── */
.batch-input-section {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.batch-input-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-dim);
}

.batch-textarea {
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
.batch-textarea:focus { border-color: var(--accent); }
.batch-textarea:disabled { opacity: 0.6; }

.batch-parse-error {
  font-size: 11px;
  color: var(--red);
}

.batch-item-count {
  font-size: 11px;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 4px;
}

.count-check { color: var(--green); }

/* ── Results table ────────────────────────────────────────────────────── */
.batch-results {
  overflow-x: auto;
}

.batch-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}

.batch-table thead tr {
  background: var(--bg-0);
}

.batch-table th {
  color: var(--text-dim);
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 5px 10px;
  text-align: left;
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}

.batch-row {
  border-bottom: 1px solid var(--bg-3);
  transition: background 0.08s;
}
.batch-row:last-child { border-bottom: none; }
.batch-row:hover { background: #111823; }

.batch-table td {
  padding: 5px 10px;
  vertical-align: top;
}

.col-index  { width: 32px; color: var(--text-dim); font-size: 10px; text-align: right; }
.col-params { width: 35%; }
.col-status { width: 100px; white-space: nowrap; }
.col-result { min-width: 0; }

/* params inline code */
.params-inline {
  color: var(--text-muted);
  font-family: inherit;
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
  max-width: 300px;
}

/* status cell */
.status-icon {
  font-size: 12px;
  margin-right: 4px;
}
.status-icon.pending { color: var(--text-dim); }
.status-icon.running { color: var(--accent); display: inline-block; animation: spin 1s linear infinite; }
.status-icon.done    { color: var(--green); }
.status-icon.error   { color: var(--red); }

.status-text {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.status-text.pending { color: var(--text-dim); }
.status-text.running { color: var(--accent); }
.status-text.done    { color: var(--green); }
.status-text.error   { color: var(--red); }

.duration-text {
  font-size: 9px;
  color: var(--border-2);
  margin-left: 4px;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

/* result cell */
.result-cell {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.result-inline {
  color: var(--text);
  font-family: inherit;
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}

.expand-btn {
  background: none;
  border: 1px solid var(--border-2);
  color: var(--text-dim);
  font-size: 10px;
  padding: 0 4px;
  border-radius: 3px;
  cursor: pointer;
  font-family: inherit;
  flex-shrink: 0;
  line-height: 1.5;
}
.expand-btn:hover { border-color: var(--text-muted); color: var(--text-muted); }
.expand-btn.active { border-color: var(--accent); color: var(--accent); background: var(--accent-bg); }

.result-expanded {
  margin: 4px 0 0;
  color: var(--text);
  font-family: inherit;
  font-size: 10px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
  background: var(--bg-0);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 6px 8px;
}

.error-message {
  color: var(--red);
  font-size: 11px;
}

.running-indicator {
  color: var(--accent);
  font-size: 11px;
  animation: pulse 1.2s ease-in-out infinite;
}

.pending-dash {
  color: var(--border-2);
  font-size: 11px;
}

@keyframes pulse {
  0%, 100% { opacity: 0.4; }
  50%       { opacity: 1; }
}

/* ── Footer ───────────────────────────────────────────────────────────── */
.batch-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  background: var(--bg-0);
  border-top: 1px solid var(--border);
  gap: 8px;
}

.footer-summary {
  font-size: 11px;
  color: var(--text-muted);
}

.footer-errors {
  color: var(--red);
}

.copy-results-btn {
  background: none;
  border: 1px solid var(--border-2);
  color: var(--text-dim);
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-family: inherit;
}
.copy-results-btn:hover { border-color: var(--text-muted); color: var(--text-muted); }
</style>
