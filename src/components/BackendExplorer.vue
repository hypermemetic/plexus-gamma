<template>
  <div class="explorer">
    <!-- Sidebar: tree -->
    <aside class="sidebar">
      <div class="sidebar-header">
        <span class="backend-label">{{ connection.name }}</span>
        <div class="sidebar-actions">
          <span v-if="hashChanged" class="hash-indicator" title="Schema changed — refreshed">↯</span>
          <button class="refresh-btn" :disabled="loading" @click="refresh" title="Refresh tree">
            <span :class="{ spinning: loading }">↻</span>
          </button>
        </div>
      </div>

      <div v-if="connectError" class="error-banner">{{ connectError }}</div>

      <div v-if="loading && !tree" class="loading-state">
        <span class="spinner">◌</span> Scanning…
      </div>

      <nav v-if="tree" class="tree" @keydown="onTreeKeydown">
        <PluginTreeNode
          :key="refreshKey"
          :node="tree"
          :selected-path="selectedPath ?? ''"
          :backend-name="connection.name"
          @select="onSelect"
        />
      </nav>
    </aside>

    <!-- Schema diff banner (feature: schema-diff) -->
    <SchemaDiffBanner
      :diff="pendingDiff"
      @dismiss="dismiss"
      @accept="() => { accept(); void refresh() }"
    />

    <!-- Main: plugin detail -->
    <PluginDetail
      v-if="!treeOnly"
      :path="selectedPath !== null ? selectedPath.split('.').filter(Boolean) : null"
      @navigate="onNavigate"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, provide, watch, onMounted, onUnmounted } from 'vue'
import { PlexusRpcClient } from '../lib/plexus/transport'
import { collectOne } from '../lib/plexus/rpc'
import { buildTree } from '../schema-walker'
import type { PluginNode } from '../plexus-schema'
import PluginTreeNode from './PluginTreeNode.vue'
import PluginDetail from './PluginDetail.vue'
// ─── Feature: schema-diff (remove 3 lines to disable) ────────
import { useSchemaDiff } from '../features/schema-diff/useSchemaDiff'
import SchemaDiffBanner from '../features/schema-diff/SchemaDiffBanner.vue'

interface RegistryBackend {
  name: string
  host: string
  port: number
  protocol: string
}

const props = defineProps<{
  connection: { name: string; url: string }
  treeOnly?: boolean
  navigateTo?: { path: string[] } | null
}>()

const emit = defineEmits<{
  'tree-ready': [node: PluginNode, backendName: string]
  'registry-backends': [backends: RegistryBackend[]]
}>()

const rpc = new PlexusRpcClient({
  backend: props.connection.name,
  url: props.connection.url,
})

provide('rpc', rpc)
provide('backendName', props.connection.name)

const tree         = ref<PluginNode | null>(null)
const { pendingDiff, dismiss, accept } = useSchemaDiff(rpc, props.connection.name, tree)
const loading      = ref(false)
const connectError = ref('')
const refreshKey   = ref(0)
const hashChanged  = ref(false)

// null = nothing selected yet; '' = root; 'echo' = echo; 'solar.earth' = solar.earth
const selectedPath = ref<string | null>(null)

async function refresh() {
  loading.value = true
  connectError.value = ''
  hashChanged.value = false
  try {
    await rpc.connect()
    tree.value = await buildTree(rpc, props.connection.name)
    emit('tree-ready', tree.value, props.connection.name)
    // Auto-discover backends if this hub has a registry plugin
    if (tree.value.children.some(c => c.schema.namespace === 'registry')) {
      try {
        const result = await collectOne<{ backends: RegistryBackend[] }>(
          rpc.call('registry.list', { active_only: true })
        )
        if (result.backends?.length) emit('registry-backends', result.backends)
      } catch { /* registry call failed, ignore */ }
    }
    refreshKey.value++
    if (props.navigateTo) {
      selectedPath.value = props.navigateTo.path.join('.')
    } else if (selectedPath.value === null) {
      selectedPath.value = ''
      if (tree.value) onSelect(tree.value)
    } else {
      const node = findNode(tree.value!, selectedPath.value.split('.').filter(Boolean))
      if (node) onSelect(node)
    }
  } catch (e) {
    connectError.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

function onTreeKeydown(e: KeyboardEvent) {
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return
  const nav = e.currentTarget as HTMLElement
  const rows = Array.from(nav.querySelectorAll<HTMLElement>('.node-row'))
  const idx  = rows.indexOf(document.activeElement as HTMLElement)
  if (idx === -1) return
  const row = rows[idx]
  if (!row) return
  e.preventDefault()

  if (e.key === 'ArrowDown') {
    rows[idx + 1]?.focus()
  } else if (e.key === 'ArrowUp') {
    rows[idx - 1]?.focus()
  } else if (e.key === 'ArrowRight') {
    const nodeDiv    = row.parentElement
    const isExpanded = !!nodeDiv?.querySelector(':scope > .node-children')
    const isHub      = row.classList.contains('hub')
    if (isHub && !isExpanded) row.click()
    else if (isHub && isExpanded) rows[idx + 1]?.focus()
  } else if (e.key === 'ArrowLeft') {
    const nodeDiv    = row.parentElement
    const isExpanded = !!nodeDiv?.querySelector(':scope > .node-children')
    if (row.classList.contains('hub') && isExpanded) {
      row.click()
    } else {
      // jump to parent row
      const parentRow = nodeDiv?.parentElement?.closest('.node')
        ?.querySelector<HTMLElement>(':scope > .node-row')
      parentRow?.focus()
    }
  }
}

function onSelect(node: PluginNode) {
  selectedPath.value = node.path.join('.')
}

function onNavigate(path: string[]) {
  selectedPath.value = path.join('.')
}

function findNode(node: PluginNode, path: string[]): PluginNode | null {
  if (node.path.join('.') === path.join('.')) return node
  for (const child of node.children) {
    const found = findNode(child, path)
    if (found) return found
  }
  return null
}

// Apply navigateTo changes after initial load
watch(() => props.navigateTo, (nav) => {
  if (nav && tree.value) {
    selectedPath.value = nav.path.join('.')
  }
}, { deep: true })

// Hash watching — detect live schema changes
let lastHash = ''
let hashTimer: ReturnType<typeof setInterval> | null = null

async function pollHash() {
  try {
    const result = await collectOne<Record<string, string>>(
      rpc.call(`${props.connection.name}.hash`, {})
    )
    const h = result['value'] ?? ''
    if (h && lastHash && h !== lastHash) {
      hashChanged.value = true
      await refresh()
    }
    if (h) lastHash = h
  } catch { /* hash not supported */ }
}

onMounted(async () => {
  await refresh()
  hashTimer = setInterval(pollHash, 2000)
})

onUnmounted(() => {
  if (hashTimer) clearInterval(hashTimer)
  rpc.disconnect()
})
</script>

<style scoped>
.explorer {
  display: flex;
  height: 100%;
  overflow: hidden;
  font-family: 'Berkeley Mono', 'Fira Code', 'Cascadia Code', ui-monospace, monospace;
  font-size: 13px;
  background: #0d0d0f;
  color: #c9d1d9;
}

.sidebar {
  width: 260px;
  flex-shrink: 0;
  background: #111114;
  border-right: 1px solid #21262d;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid #21262d;
}

.backend-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #58a6ff;
}

.sidebar-actions { display: flex; align-items: center; gap: 6px; }

.hash-indicator { font-size: 14px; color: #f0c040; cursor: default; }

.refresh-btn {
  background: none; border: none; color: #8b949e;
  cursor: pointer; font-size: 16px; padding: 2px 4px;
  border-radius: 4px; line-height: 1;
}
.refresh-btn:hover:not(:disabled) { color: #c9d1d9; background: #21262d; }
.refresh-btn:disabled { opacity: 0.4; cursor: default; }

@keyframes spin { to { transform: rotate(360deg); } }
.spinning { display: inline-block; animation: spin 0.8s linear infinite; }

.error-banner {
  padding: 8px 14px;
  background: #2d1117;
  color: #f85149;
  font-size: 11px;
  border-bottom: 1px solid #3d2121;
}

.loading-state {
  padding: 20px 14px;
  color: #8b949e;
  display: flex;
  align-items: center;
  gap: 6px;
}

@keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
.spinner { animation: pulse 1.2s ease-in-out infinite; }

.tree {
  flex: 1;
  overflow-y: auto;
  padding: 6px 0;
}
</style>
