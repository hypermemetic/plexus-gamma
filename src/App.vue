<template>
  <div class="app">
    <!-- Command palette -->
    <CommandPalette
      :entries="methodIndex"
      :open="paletteOpen"
      @close="paletteOpen = false"
      @select="onPaletteSelect"
    />

    <!-- Connection bar -->
    <header class="conn-bar">
      <!-- Backend selector (health chips) -->
      <HealthDashboard
        :connections="connections"
        :active-backend="activeConn?.name"
        :scanning="scanning"
        :open="healthOpen"
        @select="onHealthSelect"
        @close="healthOpen = false"
      />

      <div class="conn-bar-right">
        <!-- Ctrl+K hint -->
        <button class="palette-trigger" @click="paletteOpen = true" title="Search methods (Ctrl+K)">
          ⌘K
        </button>

        <!-- Replay history (feature: replay) -->
        <button class="palette-trigger" @click="replayOpen = !replayOpen" title="Invocation history">⏱</button>

        <!-- Add connection form -->
        <form v-if="showAdd" class="add-form" @submit.prevent="addConnection">
          <input v-model="newName" class="add-input" placeholder="backend name" required />
          <input v-model="newUrl"  class="add-input" placeholder="ws://127.0.0.1:4444" required />
          <button type="submit" class="add-submit">connect</button>
          <button type="button" class="add-cancel" @click="showAdd = false">✕</button>
        </form>
        <button v-else class="add-btn" @click="showAdd = true" title="Add backend">+</button>

        <!-- Theme toggle -->
        <button class="theme-toggle" @click="toggleTheme" :title="theme === 'daylight' ? 'Switch to midnight' : 'Switch to daylight'">
          {{ theme === 'daylight' ? '☾' : '☀' }}
        </button>

        <!-- Build hash -->
        <span class="build-hash" title="Build commit">{{ buildHash }}</span>

        <!-- View switcher -->
        <div class="view-tabs">
          <button class="view-tab" :class="{ active: view === 'multi-explorer' }" @click="view = 'multi-explorer'">explore</button>
          <button class="view-tab" :class="{ active: view === 'canvas' }"         @click="view = 'canvas'">canvas</button>
          <button class="view-tab" :class="{ active: view === 'sheet' }"          @click="view = 'sheet'">sheet</button>
          <button class="view-tab" :class="{ active: view === 'wiring' }"         @click="view = 'wiring'">wiring</button>
          <button class="view-tab" :class="{ active: view === 'orchestration' }"  @click="view = 'orchestration'">orchestrate</button>
        </div>
      </div>
    </header>

    <!-- Main area -->
    <main class="main">
      <!-- All backends view (default) -->
      <template v-if="view === 'multi-explorer'">
        <MultiBackendExplorer
          :connections="connections"
          :navigate-to="navigateTo"
          @tree-ready="onTreeReady"
          @registry-backends="onRegistryBackends"
          @open-health="healthOpen = true"
        />
      </template>

      <!-- Multi-backend canvas view -->
      <template v-else-if="view === 'canvas'">
        <MultiBackendCanvas
          :connections="connections"
          @select="onCanvasSelect"
        />
      </template>

      <!-- Tree + sheet view (multi-backend) -->
      <template v-else-if="view === 'sheet'">
        <TreeSheetView
          :connections="connections"
          @tree-ready="onTreeReady"
          @registry-backends="onRegistryBackends"
        />
      </template>

      <!-- Method wiring view (feature: method-wiring) -->
      <template v-else-if="view === 'wiring'">
        <MethodWiringCanvas :connections="connections" :method-index="methodIndex" />
      </template>

      <!-- Orchestration view (feature: orchestration) -->
      <template v-else-if="view === 'orchestration'">
        <OrchestrationCanvas :connections="connections" :method-index="methodIndex" />
      </template>
    </main>

    <!-- Replay panel (feature: replay) -->
    <ReplayPanel :open="replayOpen" @close="replayOpen = false" />
  </div>
</template>

<script setup lang="ts">
declare const __GIT_HASH__: string
const buildHash = __GIT_HASH__
import { ref, provide, onMounted, watch } from 'vue'
import MultiBackendCanvas from './components/MultiBackendCanvas.vue'
import MultiBackendExplorer from './components/MultiBackendExplorer.vue'
import TreeSheetView from './components/TreeSheetView.vue'
import CommandPalette from './components/CommandPalette.vue'
import type { MethodEntry } from './components/CommandPalette.vue'
import { scanPortRange } from './lib/plexus/discover'
import { useKeymap } from './lib/useKeymap'
import { flattenTree } from './schema-walker'
import type { PluginNode } from './plexus-schema'
// ─── Features (remove any import + usage to disable) ─────────
import MethodWiringCanvas from './features/method-wiring/MethodWiringCanvas.vue'
import OrchestrationCanvas from './features/orchestration/OrchestrationCanvas.vue'
import HealthDashboard from './features/health/HealthDashboard.vue'
import ReplayPanel from './features/replay/ReplayPanel.vue'
import { useInvocationHistory } from './features/replay/useInvocationHistory'

interface BackendConnection {
  name: string
  url: string
}

const connections = ref<BackendConnection[]>([
  { name: 'substrate', url: 'ws://127.0.0.1:4444' },
])

const activeConn = ref<BackendConnection | null>(connections.value[0] ?? null)

// ─── Theme ────────────────────────────────────────────────────
type Theme = 'daylight' | 'midnight'
const savedTheme = localStorage.getItem('plexus-theme') as Theme | null
const theme = ref<Theme>(savedTheme ?? 'daylight')
function applyTheme(t: Theme) { document.documentElement.dataset.theme = t }
applyTheme(theme.value)
watch(theme, t => { applyTheme(t); localStorage.setItem('plexus-theme', t) })
function toggleTheme() { theme.value = theme.value === 'daylight' ? 'midnight' : 'daylight' }

type ViewName = 'multi-explorer' | 'canvas' | 'sheet' | 'wiring' | 'orchestration'
const VALID_VIEWS: ViewName[] = ['multi-explorer', 'canvas', 'sheet', 'wiring', 'orchestration']
const savedView = localStorage.getItem('plexus-active-view') as ViewName | null
const view = ref<ViewName>(VALID_VIEWS.includes(savedView!) ? savedView! : 'multi-explorer')
watch(view, v => localStorage.setItem('plexus-active-view', v))
const healthOpen = ref(false)
const showAdd    = ref(false)
const newName    = ref('')
const newUrl     = ref('ws://127.0.0.1:')

// ─── Registry auto-discovery ─────────────────────────────────
function onRegistryBackends(backends: { name: string; host: string; port: number; protocol: string }[]) {
  for (const b of backends) {
    const url = `${b.protocol}://${b.host}:${b.port}`
    if (!connections.value.find(c => c.name === b.name || c.url === url)) {
      connections.value.push({ name: b.name, url })
    }
  }
}

// ─── Port-scan discovery ──────────────────────────────────────
const scanning   = ref(false)

async function runScan() {
  scanning.value = true
  try {
    for await (const b of scanPortRange(4440, 4450)) {
      if (!connections.value.find(c => c.name === b.name || c.url === b.url)) {
        connections.value.push({ name: b.name, url: b.url })
        if (!activeConn.value) activeConn.value = connections.value[0] ?? null
      }
    }
  } finally {
    scanning.value = false
  }
}

// ─── Method index ────────────────────────────────────────────
const methodIndex = ref<MethodEntry[]>([])

function onTreeReady(node: PluginNode, backendName: string) {
  const allNodes = flattenTree(node)
  const entries: MethodEntry[] = []
  for (const n of allNodes) {
    const ns = n.path.length === 0 ? backendName : n.path.join('.')
    for (const m of n.schema.methods) {
      entries.push({
        backend: backendName,
        fullPath: `${ns}.${m.name}`,
        path: n.path,
        method: m,
      })
    }
  }
  methodIndex.value = [
    ...methodIndex.value.filter(e => e.backend !== backendName),
    ...entries,
  ]
}

// ─── Command palette ─────────────────────────────────────────
const paletteOpen = ref(false)

useKeymap({
  'ctrl+k': () => { paletteOpen.value = true },
  'meta+k': () => { paletteOpen.value = true },
})

// ─── Navigate-to (palette → explorer) ───────────────────────
const navigateTo   = ref<{ backend: string; path: string[] } | null>(null)
const pendingMethod = ref<string | null>(null)

provide('pendingMethod', pendingMethod)

// ─── Replay history ───────────────────────────────────────────
const invocationHistory = useInvocationHistory()
provide('invocationHistory', invocationHistory)
const replayOpen = ref(false)

function onPaletteSelect(entry: MethodEntry) {
  view.value = 'multi-explorer'
  const conn = connections.value.find(c => c.name === entry.backend)
  if (conn) activeConn.value = conn
  navigateTo.value   = { backend: entry.backend, path: entry.path }
  pendingMethod.value = entry.fullPath
  // Clear navigateTo after it has been consumed
  setTimeout(() => { navigateTo.value = null }, 3000)
}

// ─── Canvas select → multi-explorer navigate ─────────────────
function onCanvasSelect(backend: string, path: string[]) {
  view.value = 'multi-explorer'
  const conn = connections.value.find(c => c.name === backend)
  if (conn) activeConn.value = conn
  navigateTo.value = { backend, path }
}

// ─── Add connection ──────────────────────────────────────────
function addConnection() {
  const conn: BackendConnection = { name: newName.value.trim(), url: newUrl.value.trim() }
  if (!connections.value.find(c => c.name === conn.name)) {
    connections.value.push(conn)
  }
  activeConn.value = conn
  showAdd.value = false
  newName.value = ''
  newUrl.value = 'ws://127.0.0.1:'
}

// ─── Backend select (from health chips) ──────────────────────
function onHealthSelect(name: string) {
  const conn = connections.value.find(c => c.name === name)
  if (conn) activeConn.value = conn
}

// ─── Lifecycle ───────────────────────────────────────────────
onMounted(runScan)
</script>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  font-family: 'Berkeley Mono', 'Fira Code', 'Cascadia Code', ui-monospace, monospace;
  font-size: 13px;
  background: var(--bg-0);
  color: var(--text);
}

/* ── Connection bar ─────────────────────────────────────────── */
.conn-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 36px;
  background: var(--bg-0);
  border-bottom: 1px solid var(--border);
  padding: 0 10px;
  flex-shrink: 0;
  gap: 8px;
}

.conn-bar-right { display: flex; align-items: center; gap: 8px; margin-left: auto; flex-shrink: 0; }
.build-hash { font-family: 'Berkeley Mono', 'Fira Code', ui-monospace, monospace; font-size: 10px; color: var(--text-dim); letter-spacing: 0.04em; }
.theme-toggle {
  background: none; border: 1px solid var(--border-2); color: var(--text-muted);
  font-size: 12px; width: 22px; height: 22px; border-radius: 4px;
  cursor: pointer; display: flex; align-items: center; justify-content: center; line-height: 1;
}
.theme-toggle:hover { border-color: var(--accent); color: var(--accent); }

.palette-trigger {
  background: none;
  border: 1px solid var(--border-2);
  color: var(--text-dim);
  font-family: inherit;
  font-size: 10px;
  padding: 2px 7px;
  border-radius: 4px;
  cursor: pointer;
  letter-spacing: 0.03em;
}
.palette-trigger:hover { border-color: var(--accent); color: var(--accent); }

.add-btn {
  background: none; border: 1px solid var(--border-2); color: var(--text-muted);
  font-size: 14px; width: 22px; height: 22px; border-radius: 4px;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  line-height: 1;
}
.add-btn:hover { border-color: var(--accent); color: var(--accent); }

.add-form { display: flex; align-items: center; gap: 4px; }
.add-input {
  background: var(--bg-3); border: 1px solid var(--border-2); color: var(--text);
  font-family: inherit; font-size: 11px; padding: 3px 8px; border-radius: 4px;
  outline: none; height: 22px;
}
.add-input:focus { border-color: var(--accent); }
.add-submit {
  background: var(--accent-bg); border: 1px solid var(--accent-bg-2); color: var(--accent);
  font-family: inherit; font-size: 11px; padding: 3px 8px; border-radius: 4px; cursor: pointer;
}
.add-cancel {
  background: none; border: none; color: var(--text-dim); cursor: pointer; font-size: 12px; padding: 2px 4px;
}

/* ── View tabs ──────────────────────────────────────────────── */
.view-tabs { display: flex; gap: 3px; }

.view-tab {
  background: none;
  border: 1px solid var(--border-2);
  color: var(--text-dim);
  font-family: inherit;
  font-size: 10px;
  padding: 2px 7px;
  border-radius: 4px;
  cursor: pointer;
  letter-spacing: 0.03em;
}
.view-tab:hover { border-color: var(--text-muted); color: var(--text-muted); }
.view-tab.active { border-color: var(--accent); color: var(--accent); background: var(--accent-bg); }

/* ── Main area ──────────────────────────────────────────────── */
.main { flex: 1; overflow: hidden; display: flex; }

.no-conn {
  flex: 1; display: flex; align-items: center; justify-content: center;
  color: var(--text-dim); font-size: 14px;
}
</style>
