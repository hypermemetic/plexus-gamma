<template>
  <div class="orch-root">
    <!-- Left panel: workflow list -->
    <aside class="orch-sidebar">
      <div class="sidebar-header">
        <span class="sidebar-title">Workflows</span>
        <button class="btn-new" @click="createWorkflow" title="New workflow">+ New</button>
      </div>
      <ul class="workflow-list">
        <li
          v-for="wf in workflows"
          :key="wf.id"
          class="workflow-item"
          :class="{ selected: selectedWorkflowId === wf.id }"
          @click="selectWorkflow(wf.id)"
        >
          <div class="workflow-item-main">
            <span class="workflow-name">{{ wf.name || 'Untitled' }}</span>
            <button
              class="btn-run-quick"
              :title="`Run ${wf.name || 'workflow'}`"
              @click.stop="runWorkflow(wf.id)"
            >&#9654;</button>
          </div>
          <div class="workflow-item-meta">
            <span class="step-count">{{ wf.steps.length }} step{{ wf.steps.length !== 1 ? 's' : '' }}</span>
            <span
              v-if="lastRunStatus(wf.id) !== null"
              class="run-badge"
              :class="lastRunStatus(wf.id) === 'ok' ? 'badge-ok' : 'badge-err'"
            >{{ lastRunStatus(wf.id) === 'ok' ? 'ok' : 'fail' }}</span>
          </div>
        </li>
        <li v-if="workflows.length === 0" class="workflow-empty">No workflows yet</li>
      </ul>
    </aside>

    <!-- Right panel: step editor + execution -->
    <main class="orch-main">
      <template v-if="selectedWorkflow">
        <!-- Top bar -->
        <div class="orch-topbar">
          <input
            v-model="selectedWorkflow.name"
            class="wf-name-input"
            placeholder="Workflow name…"
            @input="persistWorkflows"
          />
          <button
            class="btn-action btn-run"
            :disabled="isRunning"
            @click="runWorkflow(selectedWorkflow.id)"
          >&#9654; Run workflow</button>
          <button
            v-if="isRunning"
            class="btn-action btn-stop"
            @click="stopRun"
          >&#9632; Stop</button>
          <button class="btn-action" @click="addStep">+ Add step</button>
          <button class="btn-action" @click="copyJson">&#10606; Copy JSON</button>
        </div>

        <!-- Step add dropdown -->
        <div v-if="showStepDropdown" class="step-dropdown-wrap" ref="dropdownRef">
          <input
            ref="stepSearchRef"
            v-model="stepSearchQuery"
            class="step-search-input"
            placeholder="Search methods…"
            spellcheck="false"
            @keydown="onStepSearchKey"
          />
          <ul class="step-search-results">
            <li
              v-for="(entry, i) in filteredMethods"
              :key="entry.fullPath"
              class="step-search-row"
              :class="{ active: i === stepSearchIdx }"
              @click="appendStep(entry)"
              @mouseenter="stepSearchIdx = i"
            >
              <span class="step-method-backend">[{{ entry.backend }}]</span>
              <span class="step-method-path">{{ entry.fullPath }}</span>
              <span v-if="entry.method.description" class="step-method-desc">{{ entry.method.description }}</span>
            </li>
            <li v-if="filteredMethods.length === 0" class="step-search-empty">No results</li>
          </ul>
        </div>

        <!-- Steps list -->
        <div class="steps-scroll">
          <div v-if="selectedWorkflow.steps.length === 0" class="steps-empty">
            No steps yet. Click <strong>+ Add step</strong> to begin.
          </div>
          <template v-for="(step, idx) in selectedWorkflow.steps" :key="step.id">
            <!-- Connector arrow (between steps) -->
            <div v-if="idx > 0" class="step-connector">
              <svg width="2" height="24" viewBox="0 0 2 24" class="connector-line">
                <line x1="1" y1="0" x2="1" y2="20" stroke="var(--border-2)" stroke-width="2"/>
                <polygon points="1,24 -2,18 4,18" fill="var(--border-2)"/>
              </svg>
            </div>

            <!-- Step card -->
            <div
              class="step-card"
              :class="[
                stepRunState(step.id)?.status === 'running' ? 'step-running' :
                stepRunState(step.id)?.status === 'done'    ? 'step-done'    :
                stepRunState(step.id)?.status === 'error'   ? 'step-error'   :
                ''
              ]"
            >
              <!-- Step header -->
              <div class="step-header">
                <span class="step-number">{{ idx + 1 }}</span>
                <input
                  v-model="step.label"
                  class="step-label-input"
                  :placeholder="`Step ${idx + 1}`"
                  @input="persistWorkflows"
                />
                <span class="step-method-tag">{{ step.method }}</span>
                <span
                  v-if="stepRunState(step.id)"
                  class="step-status-badge"
                  :class="`status-${stepRunState(step.id)!.status}`"
                >{{ stepRunState(step.id)!.status }}</span>
                <button class="btn-remove-step" @click="removeStep(step.id)" title="Remove step">&#10005;</button>
              </div>

              <!-- Params editor -->
              <div class="step-body">
                <div class="step-params-row">
                  <div class="step-params-header">
                    <span class="step-section-label">params</span>
                    <button
                      v-if="resolvedStepSchema(step)"
                      class="json-toggle-btn"
                      @click="jsonMode[step.id] = !jsonMode[step.id]"
                    >{{ jsonMode[step.id] ? 'form' : 'JSON' }}</button>
                  </div>
                  <SchemaField
                    v-if="!jsonMode[step.id] && resolvedStepSchema(step)"
                    :name="step.id"
                    :schema="resolvedStepSchema(step)!"
                    :model-value="step.params"
                    @update:model-value="val => { step.params = val as Record<string,unknown>; persistWorkflows() }"
                  />
                  <textarea
                    v-else
                    v-model="paramsText[step.id]"
                    class="step-params-textarea"
                    :class="{ invalid: paramsError[step.id] }"
                    rows="3"
                    spellcheck="false"
                    @input="onParamsInput(step.id)"
                  />
                  <span v-if="paramsError[step.id]" class="params-error-msg">{{ paramsError[step.id] }}</span>
                </div>

                <!-- Wires -->
                <div v-if="step.wires.length > 0" class="step-wires">
                  <span class="step-section-label">wires</span>
                  <div
                    v-for="(wire, wi) in step.wires"
                    :key="wi"
                    class="wire-row"
                  >
                    <span class="wire-to-param">{{ wire.toParam }}</span>
                    <span class="wire-arrow">&#8592;</span>
                    <span class="wire-from">step{{ stepIndexById(wire.fromStepId) + 1 }}.result{{ wire.fromPath ? '.' + wire.fromPath : '' }}</span>
                    <button class="btn-remove-wire" @click="removeWire(step.id, wi)" title="Remove wire">&#10005;</button>
                  </div>
                </div>

                <!-- Add wire form -->
                <div v-if="addingWireForStepId === step.id" class="wire-add-form">
                  <span class="step-section-label">add wire</span>
                  <div class="wire-form-fields">
                    <label class="wire-form-label">from step</label>
                    <select v-model="newWire.fromStepId" class="wire-select">
                      <option
                        v-for="(s, si) in priorSteps(step.id)"
                        :key="s.id"
                        :value="s.id"
                      >{{ si + 1 }}{{ s.label ? ': ' + s.label : '' }}</option>
                    </select>
                    <label class="wire-form-label">path</label>
                    <input v-model="newWire.fromPath" class="wire-input" placeholder="e.g. path (optional)" />
                    <label class="wire-form-label">to param</label>
                    <input v-model="newWire.toParam" class="wire-input" placeholder="param name" />
                  </div>
                  <div class="wire-form-actions">
                    <button class="btn-wire-ok" @click="confirmAddWire(step.id)">Add</button>
                    <button class="btn-wire-cancel" @click="cancelAddWire">Cancel</button>
                  </div>
                </div>

                <!-- Step actions -->
                <div class="step-actions">
                  <button
                    v-if="addingWireForStepId !== step.id && idx > 0"
                    class="btn-add-wire"
                    @click="startAddWire(step.id)"
                  >+ add wire</button>
                </div>

                <!-- Run state: stream items -->
                <div v-if="stepRunState(step.id)?.streamItems.length" class="step-stream">
                  <div
                    v-for="(line, li) in stepRunState(step.id)!.streamItems"
                    :key="li"
                    class="stream-line"
                  >{{ line }}</div>
                </div>

                <!-- Run state: result -->
                <div v-if="stepRunState(step.id)?.status === 'done' && stepRunState(step.id)?.result !== undefined" class="step-result">
                  <details>
                    <summary class="result-summary">
                      result
                      <span class="result-duration">{{ stepRunState(step.id)!.durationMs }}ms</span>
                    </summary>
                    <pre class="result-json">{{ JSON.stringify(stepRunState(step.id)!.result, null, 2) }}</pre>
                  </details>
                </div>

                <!-- Run state: error -->
                <div v-if="stepRunState(step.id)?.status === 'error'" class="step-error-msg">
                  <span class="error-label">error</span>
                  {{ stepRunState(step.id)!.error }}
                </div>
              </div>
            </div>
          </template>
        </div>
      </template>

      <div v-else class="orch-placeholder">
        <p>Select a workflow from the left, or click <strong>+ New</strong> to create one.</p>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import type { MethodEntry } from '../../components/CommandPalette.vue'
import { useContainedFocus } from '../../lib/useContainedFocus'
import { getSharedClient } from '../../lib/plexus/clientRegistry'
import SchemaField from '../../components/SchemaField.vue'
import type { JsonSchema } from '../../components/SchemaField.vue'
import { getCachedTreeSync } from '../../lib/plexus/schemaCache'
import { flattenTree } from '../../schema-walker'
import type { MethodSchema } from '../../plexus-schema'

// ─── Props ────────────────────────────────────────────────────────────────────

const props = defineProps<{
  connections: { name: string; url: string }[]
  methodIndex: MethodEntry[]
}>()

// ─── Data model ───────────────────────────────────────────────────────────────

interface WorkflowStep {
  id: string
  label: string
  method: string
  backend: string
  params: Record<string, unknown>
  wires: { fromStepId: string; fromPath: string; toParam: string }[]
}

interface Workflow {
  id: string
  name: string
  steps: WorkflowStep[]
  createdAt: number
}

interface StepRunState {
  stepId: string
  status: 'pending' | 'running' | 'done' | 'error'
  result: unknown
  error: string
  durationMs: number
  streamItems: string[]
}

// ─── Persistence ──────────────────────────────────────────────────────────────

const STORAGE_KEY = 'plexus-gamma:workflows'

function loadWorkflows(): Workflow[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed as Workflow[]
  } catch {
    return []
  }
}

function persistWorkflows() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workflows.value))
}

// ─── State ────────────────────────────────────────────────────────────────────

const workflows = ref<Workflow[]>(loadWorkflows())
const selectedWorkflowId = ref<string | null>(null)

const selectedWorkflow = computed<Workflow | null>(() => {
  if (!selectedWorkflowId.value) return null
  return workflows.value.find(w => w.id === selectedWorkflowId.value) ?? null
})

// Per-step params text buffer and error state
const paramsText = ref<Record<string, string>>({})
const paramsError = ref<Record<string, string>>({})

// Run state
const runStates = ref<Record<string, Record<string, StepRunState>>>({})
const lastRunResults = ref<Record<string, 'ok' | 'err'>>({})
const isRunning = ref(false)
let stopFlag = false

// Step-add dropdown
const showStepDropdown = ref(false)
const stepSearchQuery = ref('')
const stepSearchIdx = ref(0)
const { focus } = useContainedFocus()
const stepSearchRef = ref<HTMLInputElement | null>(null)
const dropdownRef = ref<HTMLElement | null>(null)

// JSON/form toggle per step
const jsonMode = reactive<Record<string, boolean>>({})

// Wire-add state
const addingWireForStepId = ref<string | null>(null)
const newWire = ref<{ fromStepId: string; fromPath: string; toParam: string }>({
  fromStepId: '',
  fromPath: '',
  toParam: '',
})

// ─── Schema helpers ───────────────────────────────────────────────────────────

function toCamelCase(s: string): string {
  return s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
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
      Object.entries(s.properties).map(([k, v]) => [toCamelCase(k), resolveRefs(v as JsonSchema & { $ref?: string }, defs)])
    )
  if (s.required) s.required = s.required.map(toCamelCase)
  if (s.items) s.items = resolveRefs(s.items as JsonSchema & { $ref?: string }, defs)
  if (s.anyOf) s.anyOf = s.anyOf.map(x => resolveRefs(x as JsonSchema & { $ref?: string }, defs))
  if (s.oneOf) s.oneOf = s.oneOf.map(x => resolveRefs(x as JsonSchema & { $ref?: string }, defs))
  return s
}

function findMethodSchema(backend: string, fullPath: string): MethodSchema | null {
  const tree = getCachedTreeSync(backend)
  if (!tree) return null
  for (const node of flattenTree(tree)) {
    const ns = node.path.length === 0 ? backend : node.path.join('.')
    for (const m of node.schema.methods)
      if (`${ns}.${m.name}` === fullPath) return m
  }
  return null
}

function resolvedStepSchema(step: WorkflowStep): JsonSchema | null {
  const m = findMethodSchema(step.backend, step.method)
  if (!m?.params || typeof m.params !== 'object') return null
  const raw = m.params as JsonSchema & { $defs?: Record<string, JsonSchema> }
  const resolved = resolveRefs(raw, raw.$defs ?? {})
  if (resolved.type !== 'object' || !resolved.properties) return null
  return resolved
}

// ─── RPC client pool ──────────────────────────────────────────────────────────

function getClient(backendName: string) {
  const conn = props.connections.find(c => c.name === backendName)
  const url = conn?.url ?? `ws://127.0.0.1:4444`
  return getSharedClient(backendName, url)
}

// ─── Workflow CRUD ────────────────────────────────────────────────────────────

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function createWorkflow() {
  const wf: Workflow = {
    id: generateId(),
    name: '',
    steps: [],
    createdAt: Date.now(),
  }
  workflows.value.push(wf)
  persistWorkflows()
  selectedWorkflowId.value = wf.id
}

function selectWorkflow(id: string) {
  selectedWorkflowId.value = id
  showStepDropdown.value = false
  addingWireForStepId.value = null
  // Populate paramsText for this workflow's steps
  const wf = workflows.value.find(w => w.id === id)
  if (wf) {
    for (const step of wf.steps) {
      if (!(step.id in paramsText.value)) {
        paramsText.value[step.id] = JSON.stringify(step.params, null, 2)
      }
    }
  }
}

// ─── Step management ──────────────────────────────────────────────────────────

const filteredMethods = computed(() => {
  const q = stepSearchQuery.value.toLowerCase()
  if (!q) return props.methodIndex.slice(0, 50)
  return props.methodIndex
    .filter(e => e.fullPath.toLowerCase().includes(q))
    .sort((a, b) => {
      const ai = a.fullPath.toLowerCase().indexOf(q)
      const bi = b.fullPath.toLowerCase().indexOf(q)
      return ai - bi
    })
    .slice(0, 50)
})

watch(stepSearchQuery, () => { stepSearchIdx.value = 0 })

function addStep() {
  showStepDropdown.value = true
  stepSearchQuery.value = ''
  stepSearchIdx.value = 0
  nextTick(() => focus(stepSearchRef.value))
}

function onStepSearchKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    stepSearchIdx.value = Math.min(stepSearchIdx.value + 1, filteredMethods.value.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    stepSearchIdx.value = Math.max(stepSearchIdx.value - 1, 0)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const entry = filteredMethods.value[stepSearchIdx.value]
    if (entry) appendStep(entry)
  } else if (e.key === 'Escape') {
    showStepDropdown.value = false
  }
}

function appendStep(entry: MethodEntry) {
  if (!selectedWorkflow.value) return
  const step: WorkflowStep = {
    id: generateId(),
    label: '',
    method: entry.fullPath,
    backend: entry.backend,
    params: {},
    wires: [],
  }
  selectedWorkflow.value.steps.push(step)
  paramsText.value[step.id] = '{}'
  persistWorkflows()
  showStepDropdown.value = false
  stepSearchQuery.value = ''
}

function removeStep(stepId: string) {
  if (!selectedWorkflow.value) return
  selectedWorkflow.value.steps = selectedWorkflow.value.steps.filter(s => s.id !== stepId)
  // Remove any wires referencing this step
  for (const s of selectedWorkflow.value.steps) {
    s.wires = s.wires.filter(w => w.fromStepId !== stepId)
  }
  delete paramsText.value[stepId]
  delete paramsError.value[stepId]
  persistWorkflows()
}

function stepIndexById(stepId: string): number {
  if (!selectedWorkflow.value) return -1
  return selectedWorkflow.value.steps.findIndex(s => s.id === stepId)
}

function priorSteps(stepId: string): WorkflowStep[] {
  if (!selectedWorkflow.value) return []
  const idx = selectedWorkflow.value.steps.findIndex(s => s.id === stepId)
  if (idx <= 0) return []
  return selectedWorkflow.value.steps.slice(0, idx)
}

// ─── Params editing ───────────────────────────────────────────────────────────

function onParamsInput(stepId: string) {
  const text = paramsText.value[stepId] ?? ''
  try {
    const parsed: unknown = JSON.parse(text)
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      const step = selectedWorkflow.value?.steps.find(s => s.id === stepId)
      if (step) {
        step.params = parsed as Record<string, unknown>
        persistWorkflows()
      }
      delete paramsError.value[stepId]
    } else {
      paramsError.value[stepId] = 'Must be a JSON object'
    }
  } catch {
    paramsError.value[stepId] = 'Invalid JSON'
  }
}

// ─── Wire management ──────────────────────────────────────────────────────────

function startAddWire(stepId: string) {
  addingWireForStepId.value = stepId
  const prior = priorSteps(stepId)
  newWire.value = {
    fromStepId: prior[0]?.id ?? '',
    fromPath: '',
    toParam: '',
  }
}

function cancelAddWire() {
  addingWireForStepId.value = null
}

function confirmAddWire(stepId: string) {
  if (!newWire.value.toParam.trim()) return
  if (!newWire.value.fromStepId) return
  const step = selectedWorkflow.value?.steps.find(s => s.id === stepId)
  if (!step) return
  step.wires.push({ ...newWire.value })
  persistWorkflows()
  addingWireForStepId.value = null
}

function removeWire(stepId: string, wireIdx: number) {
  const step = selectedWorkflow.value?.steps.find(s => s.id === stepId)
  if (!step) return
  step.wires.splice(wireIdx, 1)
  persistWorkflows()
}

// ─── Execution ────────────────────────────────────────────────────────────────

function stepRunState(stepId: string): StepRunState | null {
  if (!selectedWorkflowId.value) return null
  const wfStates = runStates.value[selectedWorkflowId.value]
  if (!wfStates) return null
  return wfStates[stepId] ?? null
}

function lastRunStatus(workflowId: string): 'ok' | 'err' | null {
  return lastRunResults.value[workflowId] ?? null
}

// Resolve a dot-path into an object
function resolvePath(obj: unknown, path: string): unknown {
  if (!path) return obj
  const parts = path.split('.')
  let cur: unknown = obj
  for (const part of parts) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[part]
  }
  return cur
}

async function runWorkflow(workflowId: string) {
  const wf = workflows.value.find(w => w.id === workflowId)
  if (!wf) return
  if (isRunning.value) return

  // Select it in UI
  selectedWorkflowId.value = workflowId

  isRunning.value = true
  stopFlag = false

  // Initialize run states for all steps
  const wfStates: Record<string, StepRunState> = {}
  for (const step of wf.steps) {
    wfStates[step.id] = {
      stepId: step.id,
      status: 'pending',
      result: undefined,
      error: '',
      durationMs: 0,
      streamItems: [],
    }
  }
  runStates.value = { ...runStates.value, [workflowId]: wfStates }

  let allOk = true

  for (const step of wf.steps) {
    if (stopFlag) break
    const state = wfStates[step.id]
    if (!state) continue

    // Merge manual params with wired values
    const mergedParams: Record<string, unknown> = { ...step.params }
    for (const wire of step.wires) {
      const priorState = wfStates[wire.fromStepId]
      if (priorState && priorState.status === 'done') {
        mergedParams[wire.toParam] = resolvePath(priorState.result, wire.fromPath)
      }
    }

    state.status = 'running'
    state.streamItems = []
    runStates.value = { ...runStates.value, [workflowId]: { ...wfStates } }

    const t0 = Date.now()
    try {
      const client = getClient(step.backend)
      const stream = client.call(step.method, mergedParams)
      let lastResult: unknown = undefined

      for await (const item of stream) {
        if (stopFlag) break
        if (item.type === 'progress') {
          state.streamItems = [...state.streamItems, item.message]
          runStates.value = { ...runStates.value, [workflowId]: { ...wfStates } }
        } else if (item.type === 'data') {
          lastResult = item.content
          state.streamItems = [...state.streamItems, `data: ${JSON.stringify(item.content).slice(0, 120)}`]
          runStates.value = { ...runStates.value, [workflowId]: { ...wfStates } }
        } else if (item.type === 'error') {
          throw new Error(item.message)
        } else if (item.type === 'done') {
          break
        }
      }

      state.status = stopFlag ? 'error' : 'done'
      state.result = lastResult
      state.error = stopFlag ? 'Stopped' : ''
      state.durationMs = Date.now() - t0
    } catch (err: unknown) {
      state.status = 'error'
      state.error = err instanceof Error ? err.message : String(err)
      state.durationMs = Date.now() - t0
      allOk = false
      runStates.value = { ...runStates.value, [workflowId]: { ...wfStates } }
      break
    }

    runStates.value = { ...runStates.value, [workflowId]: { ...wfStates } }
  }

  lastRunResults.value = { ...lastRunResults.value, [workflowId]: allOk && !stopFlag ? 'ok' : 'err' }
  isRunning.value = false
}

function stopRun() {
  stopFlag = true
}

// ─── Copy JSON ────────────────────────────────────────────────────────────────

function copyJson() {
  if (!selectedWorkflow.value) return
  navigator.clipboard.writeText(JSON.stringify(selectedWorkflow.value, null, 2))
}

// ─── Click-outside to close dropdown ─────────────────────────────────────────

function onDocClick(e: MouseEvent) {
  if (!showStepDropdown.value) return
  if (dropdownRef.value && !dropdownRef.value.contains(e.target as Node)) {
    showStepDropdown.value = false
  }
}

watch(showStepDropdown, (v) => {
  if (v) document.addEventListener('click', onDocClick, { capture: true })
  else document.removeEventListener('click', onDocClick, { capture: true })
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick, { capture: true })
})
</script>

<style scoped>
/* ── Root layout ────────────────────────────────────────────────────────────── */
.orch-root {
  display: flex;
  height: 100%;
  overflow: hidden;
  background: var(--bg-0);
  font-family: 'Berkeley Mono', 'Fira Code', 'Cascadia Code', ui-monospace, monospace;
  font-size: 12px;
  color: var(--text);
}

/* ── Left sidebar ───────────────────────────────────────────────────────────── */
.orch-sidebar {
  width: 280px;
  flex-shrink: 0;
  background: var(--bg-0);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.sidebar-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.btn-new {
  background: var(--accent-bg);
  border: 1px solid var(--accent-bg-2);
  color: var(--accent);
  font-family: inherit;
  font-size: 11px;
  padding: 3px 9px;
  border-radius: 4px;
  cursor: pointer;
}
.btn-new:hover { background: #1f3060; }

.workflow-list {
  list-style: none;
  padding: 0;
  margin: 0;
  overflow-y: auto;
  flex: 1;
}

.workflow-item {
  padding: 8px 12px;
  border-bottom: 1px solid var(--bg-3);
  cursor: pointer;
}
.workflow-item:hover { background: var(--bg-1); }
.workflow-item.selected { background: #0d1a2e; border-left: 2px solid var(--accent); }

.workflow-item-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.workflow-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text);
  font-size: 12px;
}

.btn-run-quick {
  background: none;
  border: 1px solid var(--border-2);
  color: var(--green);
  font-size: 10px;
  width: 20px;
  height: 20px;
  border-radius: 3px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  line-height: 1;
}
.btn-run-quick:hover { background: var(--green-bg); border-color: var(--green); }

.workflow-item-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 3px;
}

.step-count {
  font-size: 10px;
  color: var(--text-dim);
}

.run-badge {
  font-size: 9px;
  padding: 1px 5px;
  border-radius: 3px;
  font-weight: 600;
  letter-spacing: 0.04em;
}
.badge-ok  { background: var(--green-bg); color: var(--green); border: 1px solid var(--green-bg); }
.badge-err { background: var(--red-bg); color: var(--red); border: 1px solid var(--red-bg); }

.workflow-empty {
  padding: 20px 12px;
  color: var(--text-dim);
  font-size: 11px;
  text-align: center;
}

/* ── Main panel ─────────────────────────────────────────────────────────────── */
.orch-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

.orch-placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-dim);
  font-size: 13px;
  text-align: center;
  padding: 24px;
}

/* ── Top bar ────────────────────────────────────────────────────────────────── */
.orch-topbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-0);
  flex-shrink: 0;
  flex-wrap: wrap;
}

.wf-name-input {
  background: var(--bg-1);
  border: 1px solid var(--border-2);
  color: var(--text-2);
  font-family: inherit;
  font-size: 13px;
  padding: 4px 10px;
  border-radius: 4px;
  outline: none;
  min-width: 180px;
  flex: 1;
  max-width: 320px;
}
.wf-name-input:focus { border-color: var(--accent); }
.wf-name-input::placeholder { color: var(--text-dim); }

.btn-action {
  background: var(--bg-3);
  border: 1px solid var(--border-2);
  color: var(--text);
  font-family: inherit;
  font-size: 11px;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
}
.btn-action:hover { border-color: var(--accent); color: var(--accent); background: #0d1a2e; }
.btn-action:disabled { opacity: 0.4; cursor: not-allowed; }

.btn-run { color: var(--green); border-color: var(--green-bg); background: var(--green-bg); }
.btn-run:hover { background: #123520; border-color: var(--green); color: var(--green); }

.btn-stop { color: var(--red); border-color: var(--red-bg); background: var(--red-bg); }
.btn-stop:hover { background: var(--red-bg); }

/* ── Step add dropdown ──────────────────────────────────────────────────────── */
.step-dropdown-wrap {
  position: absolute;
  top: 46px;
  left: 14px;
  z-index: 200;
  width: 480px;
  background: var(--bg-3);
  border: 1px solid var(--border-2);
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.7);
  overflow: hidden;
}

.step-search-input {
  width: 100%;
  background: var(--bg-2);
  border: none;
  border-bottom: 1px solid var(--border-2);
  color: var(--text-2);
  font-family: inherit;
  font-size: 13px;
  padding: 10px 14px;
  outline: none;
  box-sizing: border-box;
}
.step-search-input::placeholder { color: var(--text-dim); }

.step-search-results {
  list-style: none;
  padding: 0;
  margin: 0;
  max-height: 260px;
  overflow-y: auto;
}

.step-search-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 14px;
  cursor: pointer;
  font-size: 11px;
  border-bottom: 1px solid var(--border);
}
.step-search-row:last-child { border-bottom: none; }
.step-search-row:hover,
.step-search-row.active { background: var(--accent-bg); }

.step-method-backend { font-size: 10px; color: var(--accent); font-weight: 600; flex-shrink: 0; }
.step-method-path { color: var(--text-2); flex-shrink: 0; }
.step-method-desc { color: var(--text-dim); font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.step-search-empty { padding: 12px 14px; color: var(--text-dim); font-size: 11px; text-align: center; }

/* ── Steps scroll area ──────────────────────────────────────────────────────── */
.steps-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px 32px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
}

.steps-empty {
  color: var(--text-dim);
  font-size: 12px;
  text-align: center;
  padding: 32px 0;
}

/* ── Connector arrow ────────────────────────────────────────────────────────── */
.step-connector {
  display: flex;
  justify-content: center;
  height: 28px;
  flex-shrink: 0;
}

.connector-line { display: block; }

/* ── Step card ──────────────────────────────────────────────────────────────── */
.step-card {
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  transition: border-color 0.2s;
}

.step-running {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px rgba(88, 166, 255, 0.15);
  animation: step-pulse 1.2s ease-in-out infinite;
}
.step-done  { border-color: var(--green); }
.step-error { border-color: var(--red); }

@keyframes step-pulse {
  0%, 100% { box-shadow: 0 0 0 2px rgba(88, 166, 255, 0.10); }
  50%       { box-shadow: 0 0 0 4px rgba(88, 166, 255, 0.25); }
}

/* ── Step header ────────────────────────────────────────────────────────────── */
.step-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg-0);
  border-bottom: 1px solid var(--border);
}

.step-number {
  font-size: 10px;
  font-weight: 700;
  color: var(--text-dim);
  width: 16px;
  flex-shrink: 0;
}

.step-label-input {
  background: none;
  border: none;
  color: var(--text);
  font-family: inherit;
  font-size: 12px;
  outline: none;
  flex: 1;
  min-width: 80px;
}
.step-label-input::placeholder { color: var(--text-dim); }
.step-label-input:focus { color: var(--text-2); }

.step-method-tag {
  font-size: 10px;
  background: var(--accent-bg);
  color: var(--accent);
  padding: 2px 7px;
  border-radius: 3px;
  flex-shrink: 0;
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.step-status-badge {
  font-size: 9px;
  padding: 1px 6px;
  border-radius: 3px;
  font-weight: 600;
  letter-spacing: 0.04em;
  flex-shrink: 0;
}
.status-pending { background: var(--bg-3); color: var(--text-dim); }
.status-running { background: #0d1a2e; color: var(--accent); }
.status-done    { background: var(--green-bg); color: var(--green); }
.status-error   { background: var(--red-bg); color: var(--red); }

.btn-remove-step {
  background: none;
  border: none;
  color: var(--text-dim);
  cursor: pointer;
  font-size: 11px;
  padding: 2px 4px;
  margin-left: auto;
  flex-shrink: 0;
}
.btn-remove-step:hover { color: var(--red); }

/* ── Step body ──────────────────────────────────────────────────────────────── */
.step-body {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.step-section-label {
  font-size: 10px;
  color: var(--text-dim);
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  margin-right: 6px;
  flex-shrink: 0;
}

/* ── Params ─────────────────────────────────────────────────────────────────── */
.step-params-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.step-params-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.json-toggle-btn {
  background: none;
  border: 1px solid var(--border-2);
  color: var(--text-dim);
  font-family: inherit;
  font-size: 10px;
  padding: 1px 7px;
  border-radius: 3px;
  cursor: pointer;
}
.json-toggle-btn:hover { border-color: var(--accent); color: var(--accent); }

.step-params-textarea {
  background: var(--bg-0);
  border: 1px solid var(--border-2);
  color: var(--text);
  font-family: inherit;
  font-size: 11px;
  padding: 6px 8px;
  border-radius: 4px;
  resize: vertical;
  outline: none;
  width: 100%;
  box-sizing: border-box;
}
.step-params-textarea:focus { border-color: var(--accent); }
.step-params-textarea.invalid { border-color: var(--red); }

.params-error-msg {
  font-size: 10px;
  color: var(--red);
}

/* ── Wires ──────────────────────────────────────────────────────────────────── */
.step-wires {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.wire-row {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--bg-0);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 11px;
}

.wire-to-param { color: var(--yellow); font-weight: 600; }
.wire-arrow    { color: var(--text-dim); }
.wire-from     { color: var(--accent-2); flex: 1; }

.btn-remove-wire {
  background: none;
  border: none;
  color: var(--text-dim);
  cursor: pointer;
  font-size: 10px;
  padding: 1px 3px;
  margin-left: auto;
}
.btn-remove-wire:hover { color: var(--red); }

/* ── Wire add form ──────────────────────────────────────────────────────────── */
.wire-add-form {
  background: var(--bg-0);
  border: 1px solid var(--border-2);
  border-radius: 6px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.wire-form-fields {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 8px;
  align-items: center;
}

.wire-form-label {
  font-size: 10px;
  color: var(--text-dim);
  text-align: right;
}

.wire-select,
.wire-input {
  background: var(--bg-1);
  border: 1px solid var(--border-2);
  color: var(--text);
  font-family: inherit;
  font-size: 11px;
  padding: 3px 7px;
  border-radius: 3px;
  outline: none;
}
.wire-select:focus,
.wire-input:focus { border-color: var(--accent); }
.wire-input::placeholder { color: var(--text-dim); }

.wire-form-actions { display: flex; gap: 6px; }

.btn-wire-ok {
  background: var(--accent-bg);
  border: 1px solid var(--accent-bg-2);
  color: var(--accent);
  font-family: inherit;
  font-size: 11px;
  padding: 3px 10px;
  border-radius: 3px;
  cursor: pointer;
}
.btn-wire-ok:hover { background: #1f3060; }

.btn-wire-cancel {
  background: none;
  border: 1px solid var(--border-2);
  color: var(--text-muted);
  font-family: inherit;
  font-size: 11px;
  padding: 3px 10px;
  border-radius: 3px;
  cursor: pointer;
}
.btn-wire-cancel:hover { color: var(--text); }

/* ── Step actions row ───────────────────────────────────────────────────────── */
.step-actions { display: flex; gap: 6px; }

.btn-add-wire {
  background: none;
  border: 1px solid var(--border-2);
  color: var(--text-dim);
  font-family: inherit;
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 3px;
  cursor: pointer;
}
.btn-add-wire:hover { border-color: var(--accent); color: var(--accent); }

/* ── Stream items ───────────────────────────────────────────────────────────── */
.step-stream {
  background: var(--bg-0);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 6px 8px;
  max-height: 80px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stream-line {
  font-size: 10px;
  color: var(--accent-2);
  white-space: pre-wrap;
  word-break: break-all;
}

/* ── Result ─────────────────────────────────────────────────────────────────── */
.step-result {
  border: 1px solid var(--border);
  border-radius: 4px;
  overflow: hidden;
}

.result-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  background: var(--bg-0);
  cursor: pointer;
  font-size: 11px;
  color: var(--text-muted);
  user-select: none;
  list-style: none;
}
.result-summary::-webkit-details-marker { display: none; }
.result-summary::before { content: '▶'; font-size: 9px; transition: transform 0.15s; }
details[open] .result-summary::before { transform: rotate(90deg); }

.result-duration {
  font-size: 10px;
  color: var(--text-dim);
}

.result-json {
  background: var(--bg-0);
  color: var(--text);
  font-family: inherit;
  font-size: 10px;
  padding: 8px 10px;
  margin: 0;
  overflow-x: auto;
  max-height: 200px;
  overflow-y: auto;
  white-space: pre;
}

/* ── Error ──────────────────────────────────────────────────────────────────── */
.step-error-msg {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 6px 8px;
  background: var(--red-bg);
  border: 1px solid var(--red-bg);
  border-radius: 4px;
  font-size: 11px;
  color: var(--red);
  word-break: break-word;
}
.error-label {
  font-weight: 700;
  letter-spacing: 0.04em;
  flex-shrink: 0;
  font-size: 10px;
  margin-top: 1px;
}
</style>
