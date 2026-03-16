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
import { ref, reactive, computed, onUnmounted, watch } from 'vue'
import { getSharedClient } from '../lib/plexus/clientRegistry'
import { collectOne } from '../lib/plexus/rpc'
import { getCachedTree, invalidateTree } from '../lib/plexus/schemaCache'
import type { PluginNode } from '../plexus-schema'
import PluginTreeNode from './PluginTreeNode.vue'
import PluginDetail from './PluginDetail.vue'
import BackendDetailProvider from './BackendDetailProvider.vue'

interface RegistryBackend {
  name: string
  host: string
  port: number
  protocol: string
}

const props = defineProps<{
  connections: { name: string; url: string }[]
  navigateTo?: { backend: string; path: string[] } | null
}>()

const emit = defineEmits<{
  'tree-ready': [node: PluginNode, backendName: string]
  'registry-backends': [backends: RegistryBackend[]]
  'open-health': [name: string]
}>()

// ─── Tree state ───────────────────────────────────────────────
const trees      = reactive<Record<string, PluginNode>>({})
const loading    = reactive<Record<string, boolean>>({})
const hashChanged = reactive<Record<string, boolean>>({})
const lastHashes: Record<string, string> = {}

// ─── Selection ────────────────────────────────────────────────
const selectedBackend = ref<string | null>(null)
const selectedPath    = ref<string[]>([])

const selectedUrl = computed(() =>
  props.connections.find(c => c.name === selectedBackend.value)?.url ?? ''
)

// ─── Load tree for a connection ───────────────────────────────
async function loadTree(conn: { name: string; url: string }): Promise<void> {
  loading[conn.name] = true
  const rpc = getSharedClient(conn.name, conn.url)
  try {
    await rpc.connect()
    const tree = await getCachedTree(rpc, conn.name)
    trees[conn.name] = tree
    emit('tree-ready', tree, conn.name)

    // Auto-discover backends if this hub has a registry plugin
    if (tree.children.some(c => c.schema.namespace === 'registry')) {
      try {
        const result = await collectOne<{ backends: RegistryBackend[] }>(
          rpc.call('registry.list', { active_only: true })
        )
        if (result.backends?.length) emit('registry-backends', result.backends)
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

// ─── Hash polling per backend ─────────────────────────────────
const hashTimers: Record<string, ReturnType<typeof setInterval>> = {}

async function pollHash(conn: { name: string; url: string }): Promise<void> {
  const rpc = getSharedClient(conn.name, conn.url)
  try {
    const result = await collectOne<Record<string, string>>(
      rpc.call(`${conn.name}.hash`, {})
    )
    const h = result['value'] ?? ''
    if (h && lastHashes[conn.name] && h !== lastHashes[conn.name]) {
      hashChanged[conn.name] = true
      invalidateTree(conn.name)
      await loadTree(conn)
    }
    if (h) lastHashes[conn.name] = h
  } catch { /* hash not supported */ }
}

function startPolling(conn: { name: string; url: string }): void {
  if (hashTimers[conn.name]) return
  hashTimers[conn.name] = setInterval(() => pollHash(conn), 2000)
}

// ─── Selection handler ────────────────────────────────────────
function onSelect(backendName: string, node: PluginNode): void {
  selectedBackend.value = backendName
  selectedPath.value = node.path
}

// ─── External navigation (palette, canvas click) ─────────────
watch(() => props.navigateTo, (nav) => {
  if (!nav) return
  selectedBackend.value = nav.backend
  selectedPath.value = nav.path
})

// ─── Watch for new connections ────────────────────────────────
watch(() => props.connections, (conns) => {
  for (const conn of conns) {
    if (!(conn.name in loading)) {
      loading[conn.name] = false
      loadTree(conn).then(() => startPolling(conn))
    }
  }
}, { immediate: true, deep: true })

// ─── Lifecycle ────────────────────────────────────────────────
onUnmounted(() => {
  for (const timer of Object.values(hashTimers)) clearInterval(timer)
})
</script>

<style scoped>
.multi-explorer {
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
  border-bottom: 1px solid #1a1f28;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  cursor: pointer;
  user-select: none;
  background: #0d0f14;
  border-bottom: 1px solid var(--border);
}
.group-header:hover { background: #131820; }

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
