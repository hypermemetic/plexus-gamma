<template>
  <!-- Collapsed toggle button -->
  <button v-if="!open" class="suite-toggle" @click="open = true" title="Open Assertion Suite">
    ✓ Tests
  </button>

  <!-- Expanded panel -->
  <div v-else class="suite-panel">
    <!-- Header -->
    <div class="suite-header">
      <span class="suite-title">Tests: <code class="suite-method">{{ fullPath }}</code></span>
      <div class="suite-header-actions">
        <button
          class="run-all-btn"
          :disabled="tests.length === 0 || anyRunning"
          @click="handleRunAll"
        >
          {{ anyRunning ? '◌ Running…' : '▶ Run all' }}
        </button>
        <button class="close-btn" @click="open = false">✕</button>
      </div>
    </div>

    <!-- New test form -->
    <div v-if="addingTest" class="new-test-form">
      <input
        v-model="newTestName"
        class="new-test-name"
        placeholder="Test name"
        @keydown.enter="commitNewTest"
        @keydown.escape="cancelNewTest"
        ref="newTestNameInput"
      />
      <textarea
        v-model="newTestParams"
        class="new-test-params"
        placeholder='params JSON (e.g. {"message":"hello"})'
        spellcheck="false"
        rows="2"
      />
      <div v-if="newTestParseError" class="form-error">{{ newTestParseError }}</div>
      <div class="new-test-actions">
        <button class="add-btn" @click="commitNewTest">Add test</button>
        <button class="cancel-btn" @click="cancelNewTest">Cancel</button>
      </div>
    </div>

    <!-- Test list -->
    <div class="test-list">
      <div v-if="methodTests.length === 0 && !addingTest" class="empty-tests">
        No tests yet.
      </div>

      <div
        v-for="test in methodTests"
        :key="test.id"
        class="test-item"
      >
        <!-- Test header row -->
        <div class="test-row">
          <button class="test-expand-btn" @click="toggleExpand(test.id)">
            {{ expandedTests.has(test.id) ? '▾' : '▸' }}
          </button>

          <span class="test-name">{{ test.name }}</span>

          <!-- Run badge -->
          <span
            v-if="runs.get(test.id)"
            class="run-badge"
            :class="runs.get(test.id)!.passed ? 'pass' : 'fail'"
            :title="runBadgeTitle(test.id)"
          >
            {{ runs.get(test.id)!.passed ? '✓' : '✗' }}
          </span>
          <span v-else class="run-badge pending" title="Not run yet">○</span>

          <button
            class="run-btn"
            :disabled="runningTests.has(test.id)"
            @click="handleRunTest(test.id)"
            title="Run this test"
          >
            {{ runningTests.has(test.id) ? '◌' : '▶ Run' }}
          </button>

          <button
            class="delete-btn"
            @click="suite.removeTest(test.id)"
            title="Delete test"
          >✗</button>
        </div>

        <!-- Expanded body -->
        <div v-if="expandedTests.has(test.id)" class="test-body">
          <!-- Params display -->
          <div class="test-params-row">
            <span class="body-label">params</span>
            <code class="test-params-code">{{ formatParams(test.params) }}</code>
          </div>

          <!-- Assertions list -->
          <div class="assertions-section">
            <div class="body-label">Assertions</div>

            <div v-if="test.assertions.length === 0" class="no-assertions">
              No assertions — add one below.
            </div>

            <div
              v-for="a in test.assertions"
              :key="a.id"
              class="assertion-row"
              :class="assertionClass(test.id, a.id)"
            >
              <span class="a-field">{{ a.field || '(result)' }}</span>
              <span class="a-op">{{ a.op }}</span>
              <span v-if="needsValue(a.op)" class="a-value">{{ a.value }}</span>

              <!-- Pass/fail indicator -->
              <span
                v-if="getAssertionResult(test.id, a.id)"
                class="a-status"
                :class="getAssertionResult(test.id, a.id)!.passed ? 'pass' : 'fail'"
                :title="getAssertionResult(test.id, a.id)!.message"
              >
                {{ getAssertionResult(test.id, a.id)!.passed ? '✓' : '✗' }}
              </span>
              <span v-else class="a-status pending">○</span>

              <!-- Actual value on failure -->
              <span
                v-if="getAssertionResult(test.id, a.id) && !getAssertionResult(test.id, a.id)!.passed"
                class="a-actual"
                :title="'actual: ' + JSON.stringify(getAssertionResult(test.id, a.id)!.actual)"
              >
                actual: {{ formatActual(getAssertionResult(test.id, a.id)!.actual) }}
              </span>

              <button
                class="delete-assertion-btn"
                @click="suite.removeAssertion(test.id, a.id)"
                title="Remove assertion"
              >✗</button>
            </div>

            <!-- Add assertion form -->
            <div v-if="addingAssertionFor === test.id" class="add-assertion-form">
              <input
                v-model="newAssertionField"
                class="a-input"
                placeholder="field (e.g. type)"
              />
              <select v-model="newAssertionOp" class="a-select">
                <option value="equals">equals</option>
                <option value="contains">contains</option>
                <option value="exists">exists</option>
                <option value="not_exists">not_exists</option>
                <option value="gt">gt</option>
                <option value="lt">lt</option>
                <option value="matches">matches</option>
              </select>
              <input
                v-if="needsValue(newAssertionOp)"
                v-model="newAssertionValue"
                class="a-input a-value-input"
                placeholder="expected value"
              />
              <button class="add-btn small" @click="commitAssertion(test.id)">add</button>
              <button class="cancel-btn small" @click="addingAssertionFor = null">cancel</button>
            </div>
            <button
              v-else
              class="add-assertion-btn"
              @click="startAddAssertion(test.id)"
            >+ add assertion</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Footer: add test button -->
    <div class="suite-footer">
      <button
        v-if="!addingTest"
        class="new-test-btn"
        @click="startAddTest"
      >+ New test</button>
      <span v-if="methodTests.length > 0" class="suite-summary">
        {{ passCount }}/{{ methodTests.length }} passing
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject, nextTick } from 'vue'
import { useContainedFocus } from '../../lib/useContainedFocus'
import type { PlexusRpcClient } from '../../lib/plexus/transport'
import type { MethodSchema } from '../../plexus-schema'
import { useAssertionSuite } from './useAssertions'
import type { AssertionOp } from './useAssertions'

// ── Props & inject ────────────────────────────────────────────────────────

const props = defineProps<{
  method: MethodSchema
  namespace: string
  backendName: string
}>()

const { focus } = useContainedFocus()
const rpc = inject<PlexusRpcClient>('rpc')!

// ── Suite composable ──────────────────────────────────────────────────────

const suite = useAssertionSuite()
const { tests, runs } = suite

// ── Computed: full method path ─────────────────────────────────────────────

const fullPath = computed(() => {
  const ns = props.namespace === '' ? props.backendName : props.namespace
  return `${ns}.${props.method.name}`
})

// ── Computed: tests for this method only ──────────────────────────────────

const methodTests = computed(() =>
  tests.value.filter(t => t.method === fullPath.value),
)

// ── Panel state ───────────────────────────────────────────────────────────

const open = ref(false)
const expandedTests = ref<Set<string>>(new Set())

function toggleExpand(id: string): void {
  const next = new Set(expandedTests.value)
  if (next.has(id)) {
    next.delete(id)
  } else {
    next.add(id)
  }
  expandedTests.value = next
}

// ── Running state ─────────────────────────────────────────────────────────

const runningTests = ref<Set<string>>(new Set())

const anyRunning = computed(() => runningTests.value.size > 0)

async function handleRunTest(testId: string): Promise<void> {
  const next = new Set(runningTests.value)
  next.add(testId)
  runningTests.value = next
  try {
    await suite.runTest(testId, rpc)
  } finally {
    const after = new Set(runningTests.value)
    after.delete(testId)
    runningTests.value = after
  }
}

async function handleRunAll(): Promise<void> {
  for (const test of methodTests.value) {
    await handleRunTest(test.id)
  }
}

// ── Add test form ─────────────────────────────────────────────────────────

const addingTest         = ref(false)
const newTestName        = ref('')
const newTestParams      = ref('{}')
const newTestParseError  = ref('')
const newTestNameInput   = ref<HTMLInputElement | null>(null)

function startAddTest(): void {
  addingTest.value        = true
  newTestName.value       = ''
  newTestParams.value     = '{}'
  newTestParseError.value = ''
  nextTick(() => focus(newTestNameInput.value))
}

function cancelNewTest(): void {
  addingTest.value = false
}

function commitNewTest(): void {
  newTestParseError.value = ''
  const name = newTestName.value.trim()
  if (!name) { newTestParseError.value = 'Name is required'; return }

  let params: unknown = {}
  const raw = newTestParams.value.trim()
  if (raw && raw !== '{}') {
    try {
      params = JSON.parse(raw)
    } catch (e) {
      newTestParseError.value = `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`
      return
    }
  }

  const id = suite.addTest({
    name,
    method: fullPath.value,
    params,
    assertions: [],
  })

  addingTest.value = false

  // Auto-expand new test
  const next = new Set(expandedTests.value)
  next.add(id)
  expandedTests.value = next
}

// ── Add assertion form ────────────────────────────────────────────────────

const addingAssertionFor  = ref<string | null>(null)
const newAssertionField   = ref('')
const newAssertionOp      = ref<AssertionOp>('equals')
const newAssertionValue   = ref('')

function startAddAssertion(testId: string): void {
  addingAssertionFor.value = testId
  newAssertionField.value  = ''
  newAssertionOp.value     = 'equals'
  newAssertionValue.value  = ''
}

function commitAssertion(testId: string): void {
  suite.addAssertion(testId, {
    field: newAssertionField.value,
    op:    newAssertionOp.value,
    value: newAssertionValue.value,
  })
  addingAssertionFor.value = null
}

// ── Helpers ───────────────────────────────────────────────────────────────

function needsValue(op: AssertionOp): boolean {
  return op !== 'exists' && op !== 'not_exists'
}

function getAssertionResult(
  testId: string,
  assertionId: string,
) {
  const run = runs.value.get(testId)
  if (!run) return null
  return run.results.find(r => r.assertionId === assertionId) ?? null
}

function assertionClass(testId: string, assertionId: string): string {
  const r = getAssertionResult(testId, assertionId)
  if (!r) return ''
  return r.passed ? 'a-pass' : 'a-fail'
}

function runBadgeTitle(testId: string): string {
  const run = runs.value.get(testId)
  if (!run) return ''
  const pass = run.results.filter(r => r.passed).length
  return `${pass}/${run.results.length} assertions passed — ${run.durationMs}ms`
}

function formatParams(params: unknown): string {
  const s = JSON.stringify(params)
  if (!s) return '{}'
  return s.length > 80 ? s.slice(0, 77) + '…' : s
}

function formatActual(actual: unknown): string {
  const s = JSON.stringify(actual)
  if (!s) return 'undefined'
  return s.length > 40 ? s.slice(0, 37) + '…' : s
}

const passCount = computed(() =>
  methodTests.value.filter(t => runs.value.get(t.id)?.passed === true).length,
)
</script>

<style scoped>
/* ── Collapsed toggle ────────────────────────────────────────────────── */
.suite-toggle {
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
.suite-toggle:hover {
  border-color: var(--green);
  color: var(--green);
}

/* ── Panel ───────────────────────────────────────────────────────────── */
.suite-panel {
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  margin-top: 6px;
}

/* ── Header ──────────────────────────────────────────────────────────── */
.suite-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg-0);
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}

.suite-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-dim);
  display: flex;
  align-items: center;
  gap: 6px;
}

.suite-method {
  color: var(--accent-2);
  font-size: 11px;
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
}

.suite-header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* ── Run all button ──────────────────────────────────────────────────── */
.run-all-btn {
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
.run-all-btn:hover:not(:disabled) { background: var(--accent-bg-2); }
.run-all-btn:disabled { opacity: 0.4; cursor: default; }

/* ── Close button ────────────────────────────────────────────────────── */
.close-btn {
  background: none;
  border: 1px solid var(--border-2);
  color: var(--text-dim);
  font-size: 11px;
  padding: 3px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-family: inherit;
}
.close-btn:hover { border-color: var(--text-muted); color: var(--text-muted); }

/* ── New test form ───────────────────────────────────────────────────── */
.new-test-form {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: var(--bg-0);
}

.new-test-name {
  background: var(--bg-2);
  border: 1px solid var(--border-2);
  border-radius: 4px;
  color: var(--text);
  font-family: inherit;
  font-size: 12px;
  padding: 5px 8px;
  outline: none;
}
.new-test-name:focus { border-color: var(--accent); }

.new-test-params {
  background: var(--bg-2);
  border: 1px solid var(--border-2);
  border-radius: 4px;
  color: var(--text);
  font-family: inherit;
  font-size: 11px;
  padding: 5px 8px;
  resize: vertical;
  box-sizing: border-box;
  outline: none;
  line-height: 1.5;
  width: 100%;
}
.new-test-params:focus { border-color: var(--accent); }

.form-error {
  font-size: 11px;
  color: var(--red);
}

.new-test-actions {
  display: flex;
  gap: 6px;
}

/* ── Shared small buttons ────────────────────────────────────────────── */
.add-btn {
  background: var(--accent-bg);
  border: 1px solid var(--accent-bg-2);
  color: var(--accent);
  font-size: 11px;
  font-weight: 600;
  padding: 4px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-family: inherit;
}
.add-btn:hover { background: var(--accent-bg-2); }
.add-btn.small { padding: 2px 8px; font-size: 10px; }

.cancel-btn {
  background: none;
  border: 1px solid var(--border-2);
  color: var(--text-dim);
  font-size: 11px;
  padding: 4px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-family: inherit;
}
.cancel-btn:hover { border-color: var(--text-muted); color: var(--text-muted); }
.cancel-btn.small { padding: 2px 8px; font-size: 10px; }

/* ── Test list ───────────────────────────────────────────────────────── */
.test-list {
  display: flex;
  flex-direction: column;
}

.empty-tests {
  padding: 12px 14px;
  font-size: 11px;
  color: var(--border-2);
  font-style: italic;
}

/* ── Test item ───────────────────────────────────────────────────────── */
.test-item {
  border-bottom: 1px solid var(--border);
}
.test-item:last-child { border-bottom: none; }

.test-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  background: var(--bg-2);
  transition: background 0.08s;
}
.test-row:hover { background: #111823; }

.test-expand-btn {
  background: none;
  border: none;
  color: var(--text-dim);
  font-size: 11px;
  cursor: pointer;
  padding: 0 2px;
  font-family: inherit;
  flex-shrink: 0;
  line-height: 1;
}
.test-expand-btn:hover { color: var(--text-muted); }

.test-name {
  color: var(--accent-2);
  font-size: 12px;
  font-weight: 500;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Run badge ───────────────────────────────────────────────────────── */
.run-badge {
  font-size: 11px;
  font-weight: 600;
  width: 18px;
  text-align: center;
  flex-shrink: 0;
}
.run-badge.pass    { color: var(--green); }
.run-badge.fail    { color: var(--red); }
.run-badge.pending { color: var(--text-dim); }

/* ── Per-test run button ─────────────────────────────────────────────── */
.run-btn {
  background: var(--accent-bg);
  border: 1px solid var(--accent-bg-2);
  color: var(--accent);
  font-size: 10px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-family: inherit;
  flex-shrink: 0;
  white-space: nowrap;
}
.run-btn:hover:not(:disabled) { background: var(--accent-bg-2); }
.run-btn:disabled { opacity: 0.4; cursor: default; }

/* ── Delete test button ──────────────────────────────────────────────── */
.delete-btn {
  background: none;
  border: 1px solid transparent;
  color: var(--text-dim);
  font-size: 10px;
  padding: 2px 5px;
  border-radius: 4px;
  cursor: pointer;
  font-family: inherit;
  flex-shrink: 0;
}
.delete-btn:hover { border-color: var(--red); color: var(--red); }

/* ── Test body ───────────────────────────────────────────────────────── */
.test-body {
  padding: 8px 14px 10px 28px;
  background: var(--bg-0);
  border-top: 1px solid var(--bg-3);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.test-params-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.body-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-dim);
  flex-shrink: 0;
}

.test-params-code {
  color: var(--text-muted);
  font-family: inherit;
  font-size: 11px;
  word-break: break-all;
}

/* ── Assertions section ──────────────────────────────────────────────── */
.assertions-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.no-assertions {
  font-size: 11px;
  color: var(--border-2);
  font-style: italic;
  padding: 2px 0;
}

/* ── Assertion row ───────────────────────────────────────────────────── */
.assertion-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  background: var(--bg-1);
  border-radius: 4px;
  font-size: 11px;
  border: 1px solid transparent;
  transition: background 0.08s;
}
.assertion-row:hover { background: var(--bg-3); }
.assertion-row.a-pass { border-color: #1f4030; }
.assertion-row.a-fail { border-color: #3d2121; }

.a-field {
  color: var(--accent-2);
  font-family: inherit;
  flex-shrink: 0;
  min-width: 0;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.a-op {
  color: var(--text-dim);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  flex-shrink: 0;
}

.a-value {
  color: var(--yellow);
  font-family: inherit;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Assertion status ────────────────────────────────────────────────── */
.a-status {
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}
.a-status.pass    { color: var(--green); }
.a-status.fail    { color: var(--red); }
.a-status.pending { color: var(--text-dim); }

.a-actual {
  font-size: 10px;
  color: var(--red);
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: help;
}

.delete-assertion-btn {
  background: none;
  border: 1px solid transparent;
  color: var(--text-dim);
  font-size: 10px;
  padding: 1px 4px;
  border-radius: 3px;
  cursor: pointer;
  font-family: inherit;
  flex-shrink: 0;
  margin-left: auto;
}
.delete-assertion-btn:hover { border-color: var(--red); color: var(--red); }

/* ── Add assertion form ──────────────────────────────────────────────── */
.add-assertion-form {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
  padding: 4px 0;
}

.a-input {
  background: var(--bg-2);
  border: 1px solid var(--border-2);
  border-radius: 4px;
  color: var(--text);
  font-family: inherit;
  font-size: 11px;
  padding: 3px 7px;
  outline: none;
  min-width: 80px;
  max-width: 140px;
}
.a-input:focus { border-color: var(--accent); }
.a-value-input { max-width: 160px; }

.a-select {
  background: var(--bg-2);
  border: 1px solid var(--border-2);
  border-radius: 4px;
  color: var(--text);
  font-family: inherit;
  font-size: 11px;
  padding: 3px 5px;
  outline: none;
  cursor: pointer;
}
.a-select:focus { border-color: var(--accent); }

.add-assertion-btn {
  background: none;
  border: 1px dashed var(--border-2);
  color: var(--text-dim);
  font-size: 10px;
  padding: 3px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-family: inherit;
  margin-top: 2px;
  transition: border-color 0.1s, color 0.1s;
}
.add-assertion-btn:hover { border-color: var(--green); color: var(--green); }

/* ── Footer ──────────────────────────────────────────────────────────── */
.suite-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 12px;
  background: var(--bg-0);
  border-top: 1px solid var(--border);
}

.new-test-btn {
  background: none;
  border: 1px dashed var(--border-2);
  color: var(--text-dim);
  font-size: 11px;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-family: inherit;
  transition: border-color 0.1s, color 0.1s;
}
.new-test-btn:hover { border-color: var(--accent); color: var(--accent); }

.suite-summary {
  font-size: 11px;
  color: var(--text-dim);
}
</style>
