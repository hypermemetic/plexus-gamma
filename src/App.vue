<template>
  <div class="app">
    <!-- Command palette -->
    <CommandPalette
      :entries="methodIndex"
      :open="paletteOpen"
      @close="paletteOpen = false"
      @select="onPaletteSelect"
    />

    <!-- Top bar -->
    <header class="conn-bar">
      <!-- View tabs — primary nav, left-anchored -->
      <nav class="view-tabs">
        <button class="view-tab" :class="{ active: view === 'multi-explorer' }" @click="view = 'multi-explorer'" title="Explorer">explore</button>
        <button class="view-tab" :class="{ active: view === 'canvas' }"         @click="view = 'canvas'"         title="Topology canvas">canvas</button>
        <button class="view-tab" :class="{ active: view === 'sheet' }"          @click="view = 'sheet'"          title="Schema sheet">sheet</button>
        <button class="view-tab" :class="{ active: view === 'wiring' }"         @click="view = 'wiring'"         title="Method wiring">wiring</button>
        <button class="view-tab" :class="{ active: view === 'orchestration' }"  @click="view = 'orchestration'"  title="Orchestration">orcha</button>
        <button class="view-tab" :class="{ active: view === 'site-builder' }"   @click="view = 'site-builder'"   title="Site builder">build</button>
      </nav>

      <!-- Right utility cluster -->
      <div class="conn-bar-right">
        <!-- Backend selector -->
        <HealthDashboard
          :open="healthOpen"
          @select="setActive"
          @close="healthOpen = false"
        />

        <div class="conn-bar-sep" />

        <!-- Search -->
        <button class="icon-btn" @click="paletteOpen = true" title="Search methods (Ctrl+K)">⌘K</button>

        <!-- Replay history -->
        <button class="icon-btn" @click="replayOpen = !replayOpen" title="Invocation history">⏱</button>

        <!-- Add connection -->
        <template v-if="showAdd">
          <form class="add-form" @submit.prevent="submitAddConnection">
            <input v-model="newName" class="add-input" placeholder="name" required />
            <input v-model="newUrl"  class="add-input" placeholder="ws://…" required />
            <button type="submit" class="add-submit">connect</button>
            <button type="button" class="add-cancel" @click="showAdd = false">✕</button>
          </form>
        </template>
        <button v-else class="icon-btn" @click="showAdd = true" title="Add backend">+</button>

        <!-- Theme -->
        <button class="icon-btn" @click="toggleTheme" :title="theme === 'daylight' ? 'Switch to midnight' : 'Switch to daylight'">
          {{ theme === 'daylight' ? '☾' : '☀' }}
        </button>

        <!-- Build hash (tooltip only) -->
        <span class="build-hash" :title="'Build: ' + gitHash">{{ gitHash }}</span>
      </div>
    </header>

    <!-- Main area -->
    <main class="main">
      <!-- All backends view (default) -->
      <template v-if="view === 'multi-explorer'">
        <MultiBackendExplorer
          @open-health="healthOpen = true"
        />
      </template>

      <!-- Multi-backend canvas view -->
      <template v-else-if="view === 'canvas'">
        <MultiBackendCanvas
          @select="onCanvasSelect"
        />
      </template>

      <!-- Tree + sheet view (multi-backend) -->
      <template v-else-if="view === 'sheet'">
        <TreeSheetView />
      </template>

      <!-- Method wiring view (feature: method-wiring) -->
      <template v-else-if="view === 'wiring'">
        <MethodWiringCanvas />
      </template>

      <!-- Orchestration view (feature: orchestration) -->
      <template v-else-if="view === 'orchestration'">
        <OrchestrationCanvas />
      </template>

      <!-- Site builder (feature: site-builder) -->
      <template v-else-if="view === 'site-builder'">
        <SiteBuilder />
      </template>
    </main>

    <!-- Replay panel (feature: replay) -->
    <ReplayPanel :open="replayOpen" @close="replayOpen = false" />
  </div>
</template>

<script setup lang="ts">
import gitHash from 'virtual:git-hash'
import { ref, provide, onMounted, watch } from 'vue'
import MultiBackendCanvas from './components/MultiBackendCanvas.vue'
import MultiBackendExplorer from './components/MultiBackendExplorer.vue'
import TreeSheetView from './components/TreeSheetView.vue'
import CommandPalette from './components/CommandPalette.vue'
import type { MethodEntry } from './components/CommandPalette.vue'
import { useKeymap } from './lib/useKeymap'
import { useBackends } from './lib/useBackends'
import { useUiState } from './lib/useUiState'
import { useBridge } from './lib/useBridge'
// ─── Features (remove any import + usage to disable) ─────────
import MethodWiringCanvas from './features/method-wiring/MethodWiringCanvas.vue'
import OrchestrationCanvas from './features/orchestration/OrchestrationCanvas.vue'
import HealthDashboard from './features/health/HealthDashboard.vue'
import ReplayPanel from './features/replay/ReplayPanel.vue'
import SiteBuilder from './features/site-builder/SiteBuilder.vue'
import { useInvocationHistory } from './features/replay/useInvocationHistory'

const {
  methodIndex,
  addConnection: storeAddConnection,
  setActive,
  scan,
} = useBackends()

// ─── Shared UI state ─────────────────────────────────────────
const { currentView: view, theme, paletteOpen, navigateTo } = useUiState()

// DOM side-effects for theme (stay in App.vue)
function applyTheme(t: 'daylight' | 'midnight') { document.documentElement.dataset.theme = t }
applyTheme(theme.value)
watch(theme, t => { applyTheme(t); localStorage.setItem('plexus-theme', t) })

// Persist view to localStorage
watch(view, v => localStorage.setItem('plexus-active-view', v))
function toggleTheme() {
  document.documentElement.classList.add('theme-switching')
  theme.value = theme.value === 'daylight' ? 'midnight' : 'daylight'
  setTimeout(() => document.documentElement.classList.remove('theme-switching'), 950)
}

const healthOpen = ref(false)
const showAdd    = ref(false)
const newName    = ref('')
const newUrl     = ref('ws://127.0.0.1:')

useKeymap({
  'ctrl+k': () => { paletteOpen.value = true },
  'meta+k': () => { paletteOpen.value = true },
})

// ─── Navigate-to (palette → explorer) ───────────────────────
const pendingMethod = ref<string | null>(null)

provide('pendingMethod', pendingMethod)

// ─── Replay history ───────────────────────────────────────────
const invocationHistory = useInvocationHistory()
provide('invocationHistory', invocationHistory)
const replayOpen = ref(false)

useBridge()

function onPaletteSelect(entry: MethodEntry) {
  view.value = 'multi-explorer'
  setActive(entry.backend)
  navigateTo.value    = { backend: entry.backend, path: entry.path }
  pendingMethod.value = entry.fullPath
  setTimeout(() => { navigateTo.value = null }, 3000)
}

// ─── Canvas select → multi-explorer navigate ─────────────────
function onCanvasSelect(backend: string, path: string[]) {
  view.value = 'multi-explorer'
  setActive(backend)
  navigateTo.value = { backend, path }
}

// ─── Add connection form ──────────────────────────────────────
function submitAddConnection() {
  storeAddConnection(newName.value.trim(), newUrl.value.trim())
  showAdd.value = false
  newName.value = ''
  newUrl.value = 'ws://127.0.0.1:'
}

// ─── Lifecycle ───────────────────────────────────────────────
onMounted(scan)
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

/* ── Top bar ────────────────────────────────────────────────── */
.conn-bar {
  display: flex;
  align-items: stretch;
  height: 36px;
  background: var(--bg-0);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  overflow: hidden;
}

/* ── View tabs — left side, underline style ─────────────────── */
.view-tabs {
  display: flex;
  align-items: stretch;
  gap: 0;
  padding-left: 4px;
  flex-shrink: 0;
}

.view-tab {
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--text-dim);
  font-family: inherit;
  font-size: 11px;
  padding: 0 14px;
  cursor: pointer;
  letter-spacing: 0.04em;
  white-space: nowrap;
  transition: color 0.1s, border-color 0.1s;
}
.view-tab:hover { color: var(--text-muted); border-bottom-color: var(--border-2); }
.view-tab.active { color: var(--accent); border-bottom-color: var(--accent); }

/* ── Right cluster ──────────────────────────────────────────── */
.conn-bar-right {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  padding: 0 8px;
  flex-shrink: 0;
}

.conn-bar-sep {
  width: 1px;
  height: 16px;
  background: var(--border);
  margin: 0 2px;
  flex-shrink: 0;
}

/* Unified icon button — all utility actions use this */
.icon-btn {
  background: none;
  border: none;
  color: var(--text-dim);
  font-family: inherit;
  font-size: 11px;
  padding: 0 6px;
  height: 24px;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  white-space: nowrap;
  transition: background 0.08s, color 0.08s;
}
.icon-btn:hover { background: var(--bg-3); color: var(--text); }

.build-hash {
  font-family: 'Berkeley Mono', 'Fira Code', ui-monospace, monospace;
  font-size: 9px;
  color: var(--text-dim);
  letter-spacing: 0.04em;
  opacity: 0.5;
  cursor: default;
}

/* Add connection inline form */
.add-form { display: flex; align-items: center; gap: 4px; }
.add-input {
  background: var(--bg-3); border: 1px solid var(--border-2); color: var(--text);
  font-family: inherit; font-size: 11px; padding: 2px 7px; border-radius: 4px;
  outline: none; height: 22px; width: 110px;
}
.add-input:focus { border-color: var(--accent); }
.add-submit {
  background: var(--accent-bg); border: 1px solid var(--accent-bg-2); color: var(--accent);
  font-family: inherit; font-size: 11px; padding: 2px 8px; border-radius: 4px; cursor: pointer; height: 22px;
}
.add-cancel {
  background: none; border: none; color: var(--text-dim); cursor: pointer; font-size: 12px; padding: 2px 4px;
}

/* ── Main area ──────────────────────────────────────────────── */
.main { flex: 1; overflow: hidden; display: flex; }

.no-conn {
  flex: 1; display: flex; align-items: center; justify-content: center;
  color: var(--text-dim); font-size: 14px;
}
</style>
