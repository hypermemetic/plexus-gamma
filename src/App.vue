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
        :open="healthOpen"
        @select="setActive"
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
        <form v-if="showAdd" class="add-form" @submit.prevent="submitAddConnection">
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
        <span class="build-hash" title="Build commit">{{ gitHash }}</span>

        <!-- View switcher -->
        <div class="view-tabs">
          <button class="view-tab" :class="{ active: view === 'multi-explorer' }" @click="view = 'multi-explorer'">explore</button>
          <button class="view-tab" :class="{ active: view === 'canvas' }"         @click="view = 'canvas'">topology</button>
          <button class="view-tab" :class="{ active: view === 'sheet' }"          @click="view = 'sheet'">sheet</button>
          <button class="view-tab" :class="{ active: view === 'wiring' }"         @click="view = 'wiring'">wiring</button>
          <button class="view-tab" :class="{ active: view === 'orchestration' }"  @click="view = 'orchestration'">orchestrate</button>
          <button class="view-tab" :class="{ active: view === 'site-builder' }"   @click="view = 'site-builder'">builder</button>
        </div>
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
