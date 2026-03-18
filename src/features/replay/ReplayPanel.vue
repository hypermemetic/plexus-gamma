<template>
  <Transition name="panel-slide">
    <div v-if="open" class="replay-panel" role="complementary" aria-label="Invocation history">
      <!-- Header -->
      <div class="panel-header">
        <span class="panel-title">History</span>
        <button class="panel-close" @click="emit('close')" title="Close history panel">&#x2715;</button>
      </div>

      <!-- Toolbar -->
      <div class="panel-toolbar">
        <input
          v-model="searchQuery"
          class="search-input"
          placeholder="search methods…"
          spellcheck="false"
          aria-label="Filter history"
        />
        <button class="clear-all-btn" @click="clear" :disabled="history.length === 0">
          clear all
        </button>
      </div>

      <!-- Manual save form -->
      <div class="manual-save">
        <button class="manual-toggle" @click="manualOpen = !manualOpen">
          {{ manualOpen ? '▾' : '▸' }} manual save
        </button>
        <div v-if="manualOpen" class="manual-form">
          <input
            v-model="manualMethod"
            class="manual-input"
            placeholder="backend.namespace.method"
            spellcheck="false"
          />
          <textarea
            v-model="manualParams"
            class="manual-textarea"
            placeholder='params JSON (e.g. {"key":"value"})'
            rows="2"
            spellcheck="false"
          />
          <textarea
            v-model="manualResult"
            class="manual-textarea"
            placeholder='result JSON (e.g. {"ok":true})'
            rows="2"
            spellcheck="false"
          />
          <div v-if="manualError" class="manual-error">{{ manualError }}</div>
          <button class="manual-save-btn" @click="saveManual">Save</button>
        </div>
      </div>

      <!-- Record list -->
      <div class="record-list">
        <div v-if="filteredHistory.length === 0" class="empty-state">
          {{ history.length === 0 ? 'No invocations recorded yet.' : 'No results for "' + searchQuery + '".' }}
        </div>

        <div
          v-for="record in filteredHistory"
          :key="record.id"
          class="record-row"
          :class="{ expanded: expandedId === record.id }"
        >
          <!-- Summary row -->
          <div class="record-summary" @click="toggleExpand(record.id)">
            <span class="record-dot">&#x25cf;</span>
            <span class="record-method">{{ record.method }}</span>
            <span class="record-duration">{{ record.durationMs }}ms</span>
            <span class="record-time">{{ formatTime(record.timestamp) }}</span>
            <button
              class="record-remove"
              @click.stop="remove(record.id)"
              title="Remove record"
            >&#x2715;</button>
          </div>

          <div v-if="expandedId === record.id" class="record-detail">
            <!-- Params -->
            <div class="detail-section">
              <span class="detail-label">params</span>
              <pre class="detail-json">{{ JSON.stringify(record.params, null, 2) }}</pre>
            </div>

            <!-- Original results summary -->
            <div class="detail-section">
              <span class="detail-label">results ({{ record.results.length }})</span>
              <pre class="detail-json">{{ formatResultsSummary(record.results) }}</pre>
            </div>

            <!-- Actions -->
            <div class="record-actions">
              <button
                class="action-btn replay-btn"
                :disabled="replayingId === record.id"
                @click="replay(record)"
              >
                {{ replayingId === record.id ? '◌ replaying…' : '&#x25b6; Replay' }}
              </button>
              <button
                v-if="replayResults.has(record.id)"
                class="action-btn diff-btn"
                :class="{ active: diffId === record.id }"
                @click="toggleDiff(record.id)"
              >
                diff
              </button>
            </div>

            <!-- Replay result -->
            <div v-if="replayResults.has(record.id) && diffId !== record.id" class="replay-result">
              <div class="detail-section">
                <span class="detail-label">new result</span>
                <pre class="detail-json replay-json">{{ formatResultsSummary(getReplayResult(record.id)) }}</pre>
              </div>
            </div>

            <!-- Diff view -->
            <div v-if="diffId === record.id && replayResults.has(record.id)" class="diff-view">
              <div class="diff-col">
                <div class="diff-header diff-removed-header">old</div>
                <div class="diff-content">
                  <div
                    v-for="(line, i) in computeDiff(record).oldLines"
                    :key="i"
                    class="diff-line"
                    :class="line.kind"
                  >{{ line.text }}</div>
                </div>
              </div>
              <div class="diff-col">
                <div class="diff-header diff-added-header">new</div>
                <div class="diff-content">
                  <div
                    v-for="(line, i) in computeDiff(record).newLines"
                    :key="i"
                    class="diff-line"
                    :class="line.kind"
                  >{{ line.text }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, computed, inject, onMounted, onUnmounted } from 'vue'
import type { PlexusRpcClient } from '../../lib/plexus/transport'
import { useInvocationHistory } from './useInvocationHistory'
import type { InvocationRecord } from './useInvocationHistory'
import { registerAction } from '../../lib/useActionRegistry'
import { useBackends } from '../../lib/useBackends'
import { getSharedClient } from '../../lib/plexus/clientRegistry'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

// Prefer injected history (from App.vue provide) but fall back to the
// module-level singleton so the panel works even without the provider.
const injected = inject<ReturnType<typeof useInvocationHistory> | null>('invocationHistory', null)
const { history, clear, remove } = injected ?? useInvocationHistory()

onMounted(() => {
  const { connections } = useBackends()
  const cleanups = [
    registerAction('replay.list', () => [...history.value]),

    registerAction('replay.clear', () => { clear(); return { ok: true } }),

    registerAction('replay.remove', (params) => {
      const id = params['id'] as string
      if (!history.value.find(r => r.id === id)) throw new Error(`Record not found: ${id}`)
      remove(id)
      return { ok: true }
    }),

    registerAction('replay.invoke', async (params) => {
      const id = params['id'] as string
      const record = history.value.find(r => r.id === id)
      if (!record) throw new Error(`Record not found: ${id}`)
      const conn = connections.value.find(c => c.name === record.backend)
      if (!conn) throw new Error(`Backend not found: ${record.backend}`)
      const client = getSharedClient(record.backend, conn.url)
      const results: unknown[] = []
      for await (const item of client.call(record.method, record.params)) {
        if (item.type === 'data')  results.push(item.content)
        if (item.type === 'error') throw new Error(item.message)
        if (item.type === 'done')  break
      }
      return { ok: true, results }
    }),
  ]
  onUnmounted(() => cleanups.forEach(f => f()))
})

// rpc is optional: panel still works without it (replay just shows error)
const rpc = inject<PlexusRpcClient | null>('rpc', null)

// ─── State ────────────────────────────────────────────────────

const searchQuery = ref('')
const expandedId  = ref<string | null>(null)
const replayingId = ref<string | null>(null)
const diffId      = ref<string | null>(null)

// Map<recordId, results>
const replayResults = ref<Map<string, unknown[]>>(new Map())

// Manual save state
const manualOpen   = ref(false)
const manualMethod = ref('')
const manualParams = ref('{}')
const manualResult = ref('{}')
const manualError  = ref('')

// ─── Computed ─────────────────────────────────────────────────

const filteredHistory = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return history.value
  return history.value.filter(r => r.method.toLowerCase().includes(q))
})

// ─── Helpers ──────────────────────────────────────────────────

function formatTime(ts: number): string {
  const d = new Date(ts)
  const h = d.getHours().toString().padStart(2, '0')
  const m = d.getMinutes().toString().padStart(2, '0')
  return `${h}:${m}`
}

function formatResultsSummary(results: unknown[]): string {
  if (results.length === 0) return '(empty)'
  if (results.length === 1) return JSON.stringify(results[0], null, 2)
  return JSON.stringify(results, null, 2)
}

function getReplayResult(id: string): unknown[] {
  return replayResults.value.get(id) ?? []
}

function toggleExpand(id: string): void {
  expandedId.value = expandedId.value === id ? null : id
  if (expandedId.value !== id) diffId.value = null
}

function toggleDiff(id: string): void {
  diffId.value = diffId.value === id ? null : id
}

// ─── Replay ───────────────────────────────────────────────────

async function replay(record: InvocationRecord): Promise<void> {
  if (!rpc) {
    const existing = new Map(replayResults.value)
    existing.set(record.id, [{ error: 'No RPC client available. Inject "rpc" via provide() in App.vue.' }])
    replayResults.value = existing
    return
  }

  replayingId.value = record.id
  diffId.value = null

  const collected: unknown[] = []
  try {
    for await (const item of rpc.call(record.method, record.params)) {
      if (item.type === 'data') {
        collected.push(item.content)
      } else if (item.type === 'error') {
        collected.push({ error: item.message, code: item.code })
        break
      } else if (item.type === 'done') {
        break
      }
    }
  } catch (e) {
    collected.push({ error: e instanceof Error ? e.message : String(e) })
  } finally {
    replayingId.value = null
  }

  const next = new Map(replayResults.value)
  next.set(record.id, collected)
  replayResults.value = next
}

// ─── Diff ─────────────────────────────────────────────────────

interface DiffLine {
  text: string
  kind: 'same' | 'added' | 'removed'
}

interface DiffResult {
  oldLines: DiffLine[]
  newLines: DiffLine[]
}

function computeDiff(record: InvocationRecord): DiffResult {
  const oldText = formatResultsSummary(record.results)
  const newText = formatResultsSummary(getReplayResult(record.id))

  const oldRaw = oldText.split('\n')
  const newRaw = newText.split('\n')

  const oldSet = new Set(oldRaw)
  const newSet = new Set(newRaw)

  const oldLines: DiffLine[] = oldRaw.map(line => ({
    text: line,
    kind: newSet.has(line) ? 'same' : 'removed',
  }))

  const newLines: DiffLine[] = newRaw.map(line => ({
    text: line,
    kind: oldSet.has(line) ? 'same' : 'added',
  }))

  return { oldLines, newLines }
}

// ─── Manual save ──────────────────────────────────────────────

function saveManual(): void {
  manualError.value = ''

  const method = manualMethod.value.trim()
  if (!method) { manualError.value = 'Method name is required.'; return }

  let params: unknown = {}
  let result: unknown = {}

  try { params = JSON.parse(manualParams.value || '{}') } catch (e) {
    manualError.value = `Params JSON error: ${e instanceof Error ? e.message : e}`; return
  }
  try { result = JSON.parse(manualResult.value || '{}') } catch (e) {
    manualError.value = `Result JSON error: ${e instanceof Error ? e.message : e}`; return
  }

  // Derive backend from method prefix (e.g. "substrate.echo.say" → "substrate")
  const backend = method.split('.')[0] ?? method

  // Use the module singleton to record so it persists even without a full provide chain
  const { record: recordFn } = injected ?? useInvocationHistory()
  recordFn({
    timestamp: Date.now(),
    backend,
    method,
    params,
    results: [result],
    durationMs: 0,
  })

  manualMethod.value = ''
  manualParams.value = '{}'
  manualResult.value = '{}'
  manualOpen.value = false
}
</script>

<style scoped>
/* ── Slide-in transition ──────────────────────────────────── */
.panel-slide-enter-active,
.panel-slide-leave-active {
  transition: transform 0.2s ease, opacity 0.2s ease;
}
.panel-slide-enter-from,
.panel-slide-leave-to {
  transform: translateX(100%);
  opacity: 0;
}

/* ── Panel shell ─────────────────────────────────────────── */
.replay-panel {
  position: fixed;
  right: 0;
  top: 36px;
  bottom: 0;
  width: 360px;
  background: var(--bg-2);
  border-left: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  z-index: 100;
  font-family: 'Berkeley Mono', 'Fira Code', 'Cascadia Code', ui-monospace, monospace;
  font-size: 12px;
  color: var(--text);
  overflow: hidden;
}

/* ── Header ──────────────────────────────────────────────── */
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.panel-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--text-muted);
}
.panel-close {
  background: none;
  border: none;
  color: var(--text-dim);
  font-size: 13px;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 3px;
  line-height: 1;
}
.panel-close:hover { color: var(--text); }

/* ── Toolbar ─────────────────────────────────────────────── */
.panel-toolbar {
  display: flex;
  gap: 6px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.search-input {
  flex: 1;
  background: var(--bg-3);
  border: 1px solid var(--border-2);
  color: var(--text);
  font-family: inherit;
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 4px;
  outline: none;
}
.search-input:focus { border-color: var(--accent); }
.clear-all-btn {
  background: none;
  border: 1px solid var(--border-2);
  color: var(--text-dim);
  font-family: inherit;
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
}
.clear-all-btn:hover:not(:disabled) { border-color: var(--red); color: var(--red); }
.clear-all-btn:disabled { opacity: 0.4; cursor: default; }

/* ── Manual save ─────────────────────────────────────────── */
.manual-save {
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.manual-toggle {
  width: 100%;
  background: none;
  border: none;
  color: var(--text-dim);
  font-family: inherit;
  font-size: 10px;
  text-align: left;
  padding: 5px 10px;
  cursor: pointer;
  letter-spacing: 0.04em;
}
.manual-toggle:hover { color: var(--text-muted); }
.manual-form {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0 10px 8px;
}
.manual-input {
  background: var(--bg-3);
  border: 1px solid var(--border-2);
  color: var(--text);
  font-family: inherit;
  font-size: 11px;
  padding: 3px 7px;
  border-radius: 4px;
  outline: none;
}
.manual-input:focus { border-color: var(--accent); }
.manual-textarea {
  background: var(--bg-3);
  border: 1px solid var(--border-2);
  color: var(--text);
  font-family: inherit;
  font-size: 11px;
  padding: 3px 7px;
  border-radius: 4px;
  resize: vertical;
  outline: none;
}
.manual-textarea:focus { border-color: var(--accent); }
.manual-error { color: var(--red); font-size: 10px; }
.manual-save-btn {
  align-self: flex-start;
  background: var(--accent-bg);
  border: 1px solid var(--accent-bg-2);
  color: var(--accent);
  font-family: inherit;
  font-size: 11px;
  padding: 3px 10px;
  border-radius: 4px;
  cursor: pointer;
}
.manual-save-btn:hover { background: var(--accent-bg-2); }

/* ── Record list ─────────────────────────────────────────── */
.record-list {
  flex: 1;
  overflow-y: auto;
}

.empty-state {
  padding: 24px 14px;
  color: var(--text-dim);
  font-size: 11px;
  text-align: center;
  font-style: italic;
}

/* ── Record row ──────────────────────────────────────────── */
.record-row {
  border-bottom: 1px solid var(--border);
}
.record-row:last-child { border-bottom: none; }

.record-summary {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 10px;
  cursor: pointer;
  user-select: none;
}
.record-summary:hover { background: var(--bg-3); }

.record-dot { color: var(--green); font-size: 8px; flex-shrink: 0; }
.record-method { flex: 1; color: var(--text); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.record-duration { color: var(--text-dim); font-size: 10px; flex-shrink: 0; }
.record-time { color: var(--text-dim); font-size: 10px; flex-shrink: 0; }
.record-remove {
  background: none; border: none; color: var(--border-2);
  font-size: 10px; cursor: pointer; padding: 1px 3px; flex-shrink: 0; line-height: 1;
}
.record-remove:hover { color: var(--red); }

/* ── Expanded detail ─────────────────────────────────────── */
.record-detail {
  padding: 6px 10px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: var(--bg-3);
  border-top: 1px solid var(--border);
}

.detail-section {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.detail-label {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-dim);
}
.detail-json {
  margin: 0;
  color: var(--text);
  font-family: inherit;
  font-size: 10px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 5px 7px;
  max-height: 120px;
  overflow-y: auto;
}
.replay-json { background: var(--green-bg); border-color: var(--green-bg); }

/* ── Actions ─────────────────────────────────────────────── */
.record-actions {
  display: flex;
  gap: 5px;
}
.action-btn {
  background: none;
  border: 1px solid var(--border-2);
  color: var(--text-muted);
  font-family: inherit;
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 4px;
  cursor: pointer;
}
.action-btn:disabled { opacity: 0.5; cursor: default; }
.replay-btn { border-color: var(--accent-bg-2); color: var(--accent); }
.replay-btn:hover:not(:disabled) { background: var(--accent-bg); }
.diff-btn { border-color: var(--yellow-bg); color: var(--yellow); }
.diff-btn:hover { background: var(--yellow-bg); }
.diff-btn.active { background: var(--yellow-bg); border-color: var(--yellow); }

/* ── Replay result ───────────────────────────────────────── */
.replay-result { display: flex; flex-direction: column; gap: 3px; }

/* ── Diff view ───────────────────────────────────────────── */
.diff-view {
  display: flex;
  gap: 4px;
  border: 1px solid var(--border);
  border-radius: 4px;
  overflow: hidden;
}
.diff-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.diff-header {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 2px 6px;
  font-weight: 600;
}
.diff-removed-header { background: var(--red-bg); color: var(--red); }
.diff-added-header   { background: var(--green-bg); color: var(--green); }

.diff-content {
  font-size: 10px;
  font-family: inherit;
  line-height: 1.5;
  max-height: 160px;
  overflow-y: auto;
  background: var(--bg-2);
}
.diff-line {
  padding: 0 6px;
  white-space: pre-wrap;
  word-break: break-all;
}
.diff-line.same    { color: var(--text-muted); }
.diff-line.removed { background: var(--red-bg); color: var(--red); }
.diff-line.added   { background: var(--green-bg); color: var(--green); }
</style>
