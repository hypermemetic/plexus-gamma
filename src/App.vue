<template>
  <div class="app">
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
          <button class="view-btn" :class="{ active: view === 'forest' }"   @click="view = 'forest'"   title="Forest canvas">⊠</button>
        </div>
      </div>
    </header>

    <!-- Explorer view: one backend at a time -->
    <main class="main">
      <template v-if="view === 'explorer'">
        <BackendExplorer
          v-if="activeConn"
          :key="activeConn.name + activeConn.url"
          :connection="activeConn"
        />
        <div v-else class="no-conn">
          <p>No backend selected. Add one with <strong>+</strong>.</p>
        </div>
      </template>

      <!-- Forest view: all backends side by side -->
      <template v-else>
        <div class="forest">
          <div v-if="connections.length === 0" class="no-conn">
            <p>No backends connected. Add one with <strong>+</strong>.</p>
          </div>
          <div
            v-for="conn in connections"
            :key="conn.name + conn.url"
            class="forest-tree"
          >
            <div class="forest-tree-label">{{ conn.name }}</div>
            <BackendExplorer :connection="conn" class="forest-explorer" />
          </div>
        </div>
      </template>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import BackendExplorer from './components/BackendExplorer.vue'

interface BackendConnection {
  name: string
  url: string
}

const connections = ref<BackendConnection[]>([
  { name: 'substrate', url: 'ws://127.0.0.1:4444' },
])

const activeConn = ref<BackendConnection | null>(connections.value[0] ?? null)
const view       = ref<'explorer' | 'forest'>('explorer')
const showAdd    = ref(false)
const newName    = ref('')
const newUrl     = ref('ws://127.0.0.1:')

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

/* ── Connection bar ─────────────────────────────────────── */
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

/* ── Main area ──────────────────────────────────────────── */
.main { flex: 1; overflow: hidden; display: flex; }

.no-conn {
  flex: 1; display: flex; align-items: center; justify-content: center;
  color: #484f58; font-size: 14px;
}

/* ── Forest view ────────────────────────────────────────── */
.forest {
  flex: 1;
  display: flex;
  overflow-x: auto;
  gap: 1px;
  background: #21262d;
}

.forest-tree {
  display: flex;
  flex-direction: column;
  min-width: 400px;
  background: #0d0d0f;
}

.forest-tree-label {
  padding: 6px 14px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #484f58;
  border-bottom: 1px solid #21262d;
  background: #0a0a0c;
}

.forest-explorer { flex: 1; overflow: hidden; }
</style>
