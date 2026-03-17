<template>
  <div class="multi-explorer">
    <!-- Left sidebar: merged tree -->
    <aside class="sidebar">
      <div v-for="conn in connections" :key="conn.name" class="backend-group">
        <!-- Backend header — click to open health dashboard -->
        <div class="group-header" @click="$emit('open-health', conn.name)">
          <span class="backend-label">{{ conn.name }}</span>
          <span v-if="loading[conn.name]" class="group-spinner">◌</span>
          <span v-if="hashChanged[conn.name]" class="hash-indicator" title="Schema changed — refreshed">↯</span>
        </div>

        <!-- Tree (always visible) -->
        <div>
          <div v-if="loading[conn.name] && !trees[conn.name]" class="group-loading">
            <span class="spinner">◌</span> Connecting…
          </div>
          <PluginTreeNode
            v-if="trees[conn.name]"
            :node="trees[conn.name]!"
            :selected-path="selectedBackend === conn.name ? selectedPath.join('.') : '__none__'"
            :backend-name="conn.name"
            @select="onSelect(conn.name, $event)"
          />
        </div>
      </div>
    </aside>

    <!-- Right: plugin detail -->
    <BackendDetailProvider
      v-if="selectedBackend"
      :key="selectedBackend"
      :rpc="getSharedClient(selectedBackend, selectedUrl)"
      :backend-name="selectedBackend"
    >
      <PluginDetail
        :path="selectedPath"
        @navigate="selectedPath = $event"
      />
    </BackendDetailProvider>

    <div v-else class="no-selection">
      <div class="no-selection-inner">
        <div class="no-selection-icon">⬡</div>
        <p>Select a plugin from the tree.</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { getSharedClient } from '../lib/plexus/clientRegistry'
import { collectOne } from '../lib/plexus/rpc'
import { getCachedTree } from '../lib/plexus/schemaCache'
import { useBackends } from '../lib/useBackends'
import { useUiState } from '../lib/useUiState'
import type { PluginNode } from '../plexus-schema'
import PluginTreeNode from './PluginTreeNode.vue'
import PluginDetail from './PluginDetail.vue'
import BackendDetailProvider from './BackendDetailProvider.vue'

const { navigateTo } = useUiState()

const emit = defineEmits<{
  'open-health': [name: string]
}>()

const { connections, hashSeq, mergeRegistryBackends } = useBackends()

// ─── Tree state ───────────────────────────────────────────────
const trees      = reactive<Record<string, PluginNode>>({})
const loading    = reactive<Record<string, boolean>>({})
const hashChanged = reactive<Record<string, boolean>>({})

// ─── Selection ────────────────────────────────────────────────
const selectedBackend = ref<string | null>(null)
const selectedPath    = ref<string[]>([])

const selectedUrl = computed(() =>
  connections.value.find(c => c.name === selectedBackend.value)?.url ?? ''
)

// ─── Load tree for a connection ───────────────────────────────
async function loadTree(conn: { name: string; url: string }): Promise<void> {
  loading[conn.name] = true
  const rpc = getSharedClient(conn.name, conn.url)
  try {
    await rpc.connect()
    const tree = await getCachedTree(rpc, conn.name)
    trees[conn.name] = tree

    // Auto-discover backends if this hub has a registry plugin
    if (tree.children.some(c => c.schema.namespace === 'registry')) {
      try {
        const result = await collectOne<{ backends: { name: string; host: string; port: number; protocol: string }[] }>(
          rpc.call('registry.list', { active_only: true })
        )
        if (result.backends?.length) mergeRegistryBackends(result.backends)
      } catch { /* registry not available */ }
    }

    // Auto-select first backend after first tree loads
    if (selectedBackend.value === null) {
      selectedBackend.value = conn.name
      selectedPath.value = []
    }
  } catch { /* connection error — skip */ } finally {
    loading[conn.name] = false
  }
}

// ─── Selection handler ────────────────────────────────────────
function onSelect(backendName: string, node: PluginNode): void {
  selectedBackend.value = backendName
  selectedPath.value = node.path
}

// ─── External navigation (palette, canvas click) ─────────────
watch(navigateTo, (nav) => {
  if (!nav) return
  selectedBackend.value = nav.backend
  selectedPath.value = nav.path
})

// ─── Watch for new connections ────────────────────────────────
watch(connections, (conns) => {
  for (const conn of conns) {
    if (!(conn.name in loading)) {
      loading[conn.name] = false
      void loadTree(conn)
    }
  }
}, { immediate: true, deep: true })

// ─── React to hash changes (centralized polling in useBackends) ───────────────
watch(() => ({ ...hashSeq }), (newSeq, oldSeq) => {
  for (const [name, seq] of Object.entries(newSeq)) {
    if (seq !== oldSeq?.[name]) {
      hashChanged[name] = true
      const conn = connections.value.find(c => c.name === name)
      if (conn) void loadTree(conn)
    }
  }
})
</script>

<style scoped>
.multi-explorer {
  flex: 1;
  display: flex;
  height: 100%;
  overflow: hidden;
  font-family: 'Berkeley Mono', 'Fira Code', 'Cascadia Code', ui-monospace, monospace;
  font-size: 13px;
  background: var(--bg-0);
  color: var(--text);
}

/* ── Sidebar ────────────────────────────────────────────────── */
.sidebar {
  width: 260px;
  flex-shrink: 0;
  background: var(--bg-1);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  overflow-x: hidden;
}

.backend-group {
  border-bottom: 1px solid var(--bg-3);
}

.group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  cursor: pointer;
  user-select: none;
  background: var(--bg-3);
  border-bottom: 1px solid var(--border);
}
.group-header:hover { background: var(--bg-3); }

.backend-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--accent);
  flex: 1;
}

.group-spinner {
  font-size: 12px;
  color: var(--text-dim);
}

@keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
.spinner { animation: pulse 1.2s ease-in-out infinite; }

.hash-indicator { font-size: 13px; color: #f0c040; }

.group-loading {
  padding: 8px 14px;
  color: var(--text-dim);
  font-size: 11px;
  display: flex;
  align-items: center;
  gap: 6px;
}

/* ── Right panel ────────────────────────────────────────────── */
.no-selection {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-dim);
}

.no-selection-inner { text-align: center; }
.no-selection-icon { font-size: 36px; margin-bottom: 10px; }
.no-selection-inner p { font-size: 13px; margin: 0; }
</style>
