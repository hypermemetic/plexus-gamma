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
      <div class="conn-tabs">
        <button
          v-for="conn in connections"
          :key="conn.name"
          class="conn-tab"
          :class="{ active: activeConn?.name === conn.name }"
          @click="activeConn = conn"
        >
          {{ conn.name }}
          <span class="conn-url">{{ conn.url.replace('ws://', '') }}</span>
        </button>
      </div>

      <div class="conn-bar-right">
        <!-- Scan badge -->
        <span v-if="scanning" class="scan-badge">
          <span class="pulse-dot">◌</span> scanning…
        </span>

        <!-- Ctrl+K hint -->
        <button class="palette-trigger" @click="paletteOpen = true" title="Search methods (Ctrl+K)">
          ⌘K
        </button>

        <!-- Add connection form -->
        <form v-if="showAdd" class="add-form" @submit.prevent="addConnection">
          <input v-model="newName" class="add-input" placeholder="backend name" required />
          <input v-model="newUrl"  class="add-input" placeholder="ws://127.0.0.1:4444" required />
          <button type="submit" class="add-submit">connect</button>
          <button type="button" class="add-cancel" @click="showAdd = false">✕</button>
        </form>
        <button v-else class="add-btn" @click="showAdd = true" title="Add backend">+</button>

        <!-- View switcher -->
        <div class="view-btns">
          <button class="view-btn" :class="{ active: view === 'explorer' }" @click="view = 'explorer'" title="Explorer">⊞</button>
          <button class="view-btn" :class="{ active: view === 'canvas' }"   @click="view = 'canvas'"   title="Forest canvas">⊠</button>
          <button class="view-btn" :class="{ active: view === 'multi' }"    @click="view = 'multi'"    title="Multi-backend canvas">⊟</button>
          <button class="view-btn" :class="{ active: view === 'sheet' }"    @click="view = 'sheet'"    title="Tree + sheet">⊕</button>
        </div>
      </div>
    </header>

    <!-- Main area -->
    <main class="main">
      <!-- Explorer view -->
      <template v-if="view === 'explorer'">
        <BackendExplorer
          v-if="activeConn"
          :key="activeConn.name + activeConn.url"
          :connection="activeConn"
          :navigate-to="navigateTo"
          @tree-ready="onTreeReady"
          @registry-backends="onRegistryBackends"
        />
        <div v-else class="no-conn">
          <p>No backend selected. Add one with <strong>+</strong>.</p>
        </div>
      </template>

      <!-- Single-backend canvas view -->
      <template v-else-if="view === 'canvas'">
        <ForestCanvas
          v-if="activeConn"
          :key="activeConn.name + activeConn.url"
          :connection="activeConn"
          @select="onCanvasSelect"
        />
        <div v-else class="no-conn">
          <p>No backend selected. Add one with <strong>+</strong>.</p>
        </div>
      </template>

      <!-- Multi-backend canvas view -->
      <template v-else-if="view === 'multi'">
        <MultiBackendCanvas
          :connections="connections"
          @select="onMultiCanvasSelect"
        />
      </template>

      <!-- Tree + sheet view -->
      <template v-else-if="view === 'sheet'">
        <TreeSheetView
          v-if="activeConn"
          :key="activeConn.name + activeConn.url"
          :connection="activeConn"
          @tree-ready="onTreeReady"
          @registry-backends="onRegistryBackends"
        />
        <div v-else class="no-conn">
          <p>No backend selected. Add one with <strong>+</strong>.</p>
        </div>
      </template>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, provide, onMounted } from 'vue'
import BackendExplorer from './components/BackendExplorer.vue'
import ForestCanvas from './components/ForestCanvas.vue'
import MultiBackendCanvas from './components/MultiBackendCanvas.vue'
import TreeSheetView from './components/TreeSheetView.vue'
import CommandPalette from './components/CommandPalette.vue'
import type { MethodEntry } from './components/CommandPalette.vue'
import { scanPortRange } from './lib/plexus/discover'
import { useKeymap } from './lib/useKeymap'
import { flattenTree } from './schema-walker'
import type { PluginNode } from './plexus-schema'

interface BackendConnection {
  name: string
  url: string
}

const connections = ref<BackendConnection[]>([
  { name: 'substrate', url: 'ws://127.0.0.1:4444' },
])

const activeConn = ref<BackendConnection | null>(connections.value[0] ?? null)
const view       = ref<'explorer' | 'canvas' | 'multi' | 'sheet'>('explorer')
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
    for await (const b of scanPortRange(4440, 44200)) {
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
const navigateTo   = ref<{ path: string[] } | null>(null)
const pendingMethod = ref<string | null>(null)

provide('pendingMethod', pendingMethod)

function onPaletteSelect(entry: MethodEntry) {
  view.value = 'explorer'
  const conn = connections.value.find(c => c.name === entry.backend)
  if (conn) activeConn.value = conn
  navigateTo.value   = { path: entry.path }
  pendingMethod.value = entry.fullPath
  // Clear navigateTo after it has been consumed
  setTimeout(() => { navigateTo.value = null }, 3000)
}

// ─── Canvas select → explorer navigate ───────────────────────
function onCanvasSelect(path: string[]) {
  view.value = 'explorer'
  navigateTo.value = { path }
}

function onMultiCanvasSelect(backend: string, path: string[]) {
  view.value = 'explorer'
  const conn = connections.value.find(c => c.name === backend)
  if (conn) activeConn.value = conn
  navigateTo.value = { path }
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
  background: #0d0d0f;
  color: #c9d1d9;
}

/* ── Connection bar ─────────────────────────────────────────── */
.conn-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 36px;
  background: #0a0a0c;
  border-bottom: 1px solid #21262d;
  padding: 0 10px;
  flex-shrink: 0;
  gap: 8px;
}

.conn-tabs { display: flex; align-items: center; gap: 2px; overflow-x: auto; }

.conn-tab {
  background: none;
  border: none;
  color: #8b949e;
  font-family: inherit;
  font-size: 11px;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}
.conn-tab:hover { background: #161b22; color: #c9d1d9; }
.conn-tab.active { background: #1a2840; color: #58a6ff; }

.conn-url { color: #484f58; font-size: 10px; }
.conn-tab.active .conn-url { color: #1f5a8a; }

.conn-bar-right { display: flex; align-items: center; gap: 8px; margin-left: auto; flex-shrink: 0; }

.scan-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: #484f58;
}

@keyframes pulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }
.pulse-dot { animation: pulse 1.2s ease-in-out infinite; }

.palette-trigger {
  background: none;
  border: 1px solid #30363d;
  color: #484f58;
  font-family: inherit;
  font-size: 10px;
  padding: 2px 7px;
  border-radius: 4px;
  cursor: pointer;
  letter-spacing: 0.03em;
}
.palette-trigger:hover { border-color: #58a6ff; color: #58a6ff; }

.add-btn {
  background: none; border: 1px solid #30363d; color: #8b949e;
  font-size: 14px; width: 22px; height: 22px; border-radius: 4px;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  line-height: 1;
}
.add-btn:hover { border-color: #58a6ff; color: #58a6ff; }

.add-form { display: flex; align-items: center; gap: 4px; }
.add-input {
  background: #161b22; border: 1px solid #30363d; color: #c9d1d9;
  font-family: inherit; font-size: 11px; padding: 3px 8px; border-radius: 4px;
  outline: none; height: 22px;
}
.add-input:focus { border-color: #58a6ff; }
.add-submit {
  background: #1a2840; border: 1px solid #1f3a5f; color: #58a6ff;
  font-family: inherit; font-size: 11px; padding: 3px 8px; border-radius: 4px; cursor: pointer;
}
.add-cancel {
  background: none; border: none; color: #484f58; cursor: pointer; font-size: 12px; padding: 2px 4px;
}

.view-btns { display: flex; border: 1px solid #30363d; border-radius: 4px; overflow: hidden; }
.view-btn {
  background: none; border: none; color: #484f58;
  font-size: 13px; padding: 2px 6px; cursor: pointer; line-height: 1;
}
.view-btn:hover { color: #8b949e; background: #161b22; }
.view-btn.active { color: #58a6ff; background: #1a2840; }

/* ── Main area ──────────────────────────────────────────────── */
.main { flex: 1; overflow: hidden; display: flex; }

.no-conn {
  flex: 1; display: flex; align-items: center; justify-content: center;
  color: #484f58; font-size: 14px;
}
</style>
