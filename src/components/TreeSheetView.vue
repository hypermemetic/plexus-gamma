<template>
  <div class="sheet-view">
    <!-- Backend selector (shown when multiple connections) -->
    <div v-if="connections.length > 1" class="sheet-conn-sel">
      <select v-model="selectedConnName" class="conn-select">
        <option v-for="c in connections" :key="c.name" :value="c.name">{{ c.name }}</option>
      </select>
    </div>

    <!-- Full-width tree -->
    <div class="tree-area">
      <div v-if="loading && !tree" class="loading-state">
        <span class="spinner">◌</span> Connecting…
      </div>
      <div v-if="connectError" class="error-banner">{{ connectError }}</div>
      <nav v-if="tree" class="tree" @keydown="onTreeKeydown">
        <PluginTreeNode
          :node="tree"
          :selected-path="sheetPath ?? ''"
          :backend-name="activeConn?.name ?? ''"
          @select="onNodeSelect"
        />
      </nav>
    </div>

    <!-- Bottom sheet -->
    <Transition name="sheet">
      <div v-if="sheetPath !== null" class="sheet">

        <!-- Sheet drag handle + close -->
        <div class="sheet-handle-row">
          <div class="sheet-handle-bar"></div>
          <button class="sheet-close" @click="sheetPath = null" title="Close (Escape)">✕</button>
        </div>

        <!-- Method full-page (slides up over the plugin overview) -->
        <Transition name="method-slide">
          <div v-if="selectedMethod && activeConn" class="method-page" @keydown.ctrl.enter.prevent="() => {}">
            <div class="method-page-header">
              <button class="back-btn" @click="selectedMethod = null">← back</button>
              <code class="method-page-title">{{ selectedMethodPath }}</code>
            </div>
            <div class="method-page-body">
              <!-- BackendDetailProvider keyed by connection so RPC re-provides on switch -->
              <BackendDetailProvider
                :key="selectedConnName"
                :rpc="activeRpc!"
                :backend-name="selectedConnName"
              >
                <MethodInvoker
                  :method="selectedMethod"
                  :namespace="sheetNamespace"
                  :backend-name="activeConn.name"
                />
              </BackendDetailProvider>
            </div>
          </div>
        </Transition>

        <!-- Plugin overview -->
        <div class="sheet-content" :class="{ hidden: !!selectedMethod }">
          <!-- Breadcrumb path -->
          <div class="sheet-breadcrumb" v-if="sheetSegments.length > 0">
            <button class="crumb crumb-root" @click="sheetPath = ''">{{ activeConn?.name ?? '' }}</button>
            <template v-for="(seg, i) in sheetSegments" :key="i">
              <span class="crumb-sep">›</span>
              <button
                class="crumb"
                :class="{ 'crumb-active': i === sheetSegments.length - 1 }"
                @click="sheetPath = sheetSegments.slice(0, i + 1).join('.')"
              >{{ seg }}</button>
            </template>
          </div>

          <Transition name="content-fade" mode="out-in">
            <div v-if="schemaLoading" class="sheet-loading" :key="'loading-' + sheetPath"><span class="spinner">◌</span></div>

            <div v-else-if="schema" :key="sheetPath" class="sheet-content">
              <div class="sheet-plugin-header">
                <h2 class="sheet-plugin-name">{{ sheetLabel }}</h2>
                <p v-if="schema.description" class="sheet-plugin-desc">{{ schema.description }}</p>
              </div>

              <!-- Children -->
              <div v-if="schema.children?.length" class="sheet-section">
                <div class="sheet-section-title">namespaces</div>
                <div class="chip-list">
                  <button
                    v-for="c in schema.children"
                    :key="c.namespace"
                    class="ns-chip"
                    @click="navigateSheet(c.namespace)"
                  >{{ c.namespace }}</button>
                </div>
              </div>

              <!-- Methods -->
              <div v-if="schema.methods.length" class="sheet-section">
                <div class="sheet-section-title">methods</div>
                <button
                  v-for="m in schema.methods"
                  :key="m.name"
                  class="method-row-btn"
                  @click="selectedMethod = m"
                >
                  <div class="method-row-left">
                    <code class="method-row-name">{{ m.name }}</code>
                    <span v-if="m.streaming" class="method-row-tag stream">stream</span>
                    <span v-if="m.bidirectional" class="method-row-tag bidir">bidir</span>
                  </div>
                  <span class="method-row-desc">{{ m.description }}</span>
                </button>
              </div>
            </div>
          </Transition>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { getSharedClient } from '../lib/plexus/clientRegistry'
import { collectOne } from '../lib/plexus/rpc'
import { getCachedTree } from '../lib/plexus/schemaCache'
import type { PluginNode, PluginSchema, MethodSchema } from '../plexus-schema'
import PluginTreeNode from './PluginTreeNode.vue'
import MethodInvoker from './MethodInvoker.vue'
import BackendDetailProvider from './BackendDetailProvider.vue'

const props = defineProps<{
  connections: { name: string; url: string }[]
}>()

const emit = defineEmits<{
  'tree-ready': [node: PluginNode, backendName: string]
  'registry-backends': [backends: { name: string; host: string; port: number; protocol: string }[]]
}>()

// ─── Active connection selection ──────────────────────────────
const selectedConnName = ref(props.connections[0]?.name ?? '')
const activeConn = computed(() => props.connections.find(c => c.name === selectedConnName.value) ?? props.connections[0])
const activeRpc  = computed(() => {
  const conn = activeConn.value
  return conn ? getSharedClient(conn.name, conn.url) : null
})

// When connection changes, reset sheet state and refresh
watch(activeConn, (conn) => {
  if (!conn) return
  sheetPath.value = null
  selectedMethod.value = null
  schema.value = null
  refresh()
})

// When new connections are added, update if first connection
watch(() => props.connections, (conns) => {
  if (!conns.find(c => c.name === selectedConnName.value)) {
    selectedConnName.value = conns[0]?.name ?? ''
  }
}, { deep: true })

// ─── Tree state ───────────────────────────────────────────────
const tree         = ref<PluginNode | null>(null)
const loading      = ref(false)
const connectError = ref('')

async function refresh() {
  const conn = activeConn.value
  const rpc  = activeRpc.value
  if (!conn || !rpc) return
  loading.value = true
  connectError.value = ''
  try {
    await rpc.connect()
    tree.value = await getCachedTree(rpc, conn.name)
    emit('tree-ready', tree.value, conn.name)
    if (tree.value.children.some(c => c.schema.namespace === 'registry')) {
      try {
        const result = await collectOne<{ backends: { name: string; host: string; port: number; protocol: string }[] }>(
          rpc.call('registry.list', { active_only: true })
        )
        if (result.backends?.length) emit('registry-backends', result.backends)
      } catch { /* ignore */ }
    }
  } catch (e) {
    connectError.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

// ─── Sheet state ──────────────────────────────────────────────
const sheetPath      = ref<string | null>(null)
const selectedMethod = ref<MethodSchema | null>(null)
const schema         = ref<PluginSchema | null>(null)
const schemaLoading  = ref(false)

const sheetSegments = computed(() =>
  sheetPath.value ? sheetPath.value.split('.').filter(Boolean) : []
)

const sheetLabel = computed(() => {
  const segs = sheetSegments.value
  return segs.length === 0 ? (activeConn.value?.name ?? '') : (segs[segs.length - 1] ?? '')
})

const sheetNamespace = computed(() => sheetPath.value ?? '')

const selectedMethodPath = computed(() =>
  selectedMethod.value ? `${sheetNamespace.value}.${selectedMethod.value.name}` : ''
)

function onNodeSelect(node: PluginNode) {
  const path = node.path.join('.')
  sheetPath.value = path
  selectedMethod.value = null
}

function navigateSheet(childNamespace: string) {
  const base = sheetPath.value ? sheetPath.value + '.' : ''
  sheetPath.value = base + childNamespace
  selectedMethod.value = null
}

// Close sheet on Escape
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (selectedMethod.value) { selectedMethod.value = null; return }
    if (sheetPath.value !== null) { sheetPath.value = null }
  }
}

// Fetch schema when sheet path changes
let fetchSeq = 0
watch(sheetPath, async (path) => {
  if (path === null) { schema.value = null; return }
  const rpc  = activeRpc.value
  const conn = activeConn.value
  if (!rpc || !conn) return
  const seq = ++fetchSeq
  schemaLoading.value = true
  schema.value = null
  try {
    const parts = path.split('.').filter(Boolean)
    const method = parts.length === 0
      ? `${conn.name}.schema`
      : `${parts.join('.')}.schema`
    const s = await collectOne<PluginSchema>(rpc.call(method, {}))
    if (seq === fetchSeq) schema.value = s
  } catch { /* ignore */ } finally {
    if (seq === fetchSeq) schemaLoading.value = false
  }
})

// ─── Tree keyboard navigation ─────────────────────────────────
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
      const parentRow = nodeDiv?.parentElement?.closest('.node')
        ?.querySelector<HTMLElement>(':scope > .node-row')
      parentRow?.focus()
    }
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  refresh()
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<style scoped>
.sheet-view {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #0d0d0f;
}

/* ── Backend selector ─────────────────────────────────────────── */
.sheet-conn-sel {
  padding: 6px 12px;
  border-bottom: 1px solid #21262d;
  flex-shrink: 0;
}

.conn-select {
  background: #161b22;
  border: 1px solid #30363d;
  color: #c9d1d9;
  font-family: inherit;
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 4px;
  outline: none;
  cursor: pointer;
}
.conn-select:focus { border-color: #58a6ff; }
.conn-select option { background: #161b22; }

/* ── Tree area ────────────────────────────────────────────────── */
.tree-area {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.loading-state {
  padding: 24px 20px;
  color: #8b949e;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.error-banner {
  padding: 8px 16px;
  background: #2d1117;
  color: #f85149;
  font-size: 11px;
}

.tree { padding: 4px 0; }

@keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
.spinner { animation: pulse 1.2s ease-in-out infinite; }

/* ── Bottom sheet ─────────────────────────────────────────────── */
.sheet {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 55%;
  background: #111114;
  border-top: 1px solid #21262d;
  border-radius: 12px 12px 0 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 -4px 32px rgba(0, 0, 0, 0.6);
}

.sheet-enter-active, .sheet-leave-active {
  transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1);
}
.sheet-enter-from, .sheet-leave-to { transform: translateY(100%); }

.sheet-handle-row {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 12px 4px;
  flex-shrink: 0;
  position: relative;
}

.sheet-handle-bar {
  width: 36px;
  height: 3px;
  background: #30363d;
  border-radius: 2px;
}

.sheet-close {
  position: absolute;
  right: 12px;
  background: none;
  border: none;
  color: #484f58;
  font-size: 14px;
  cursor: pointer;
  padding: 2px 4px;
  line-height: 1;
}
.sheet-close:hover { color: #8b949e; }

/* ── Sheet content ────────────────────────────────────────────── */
.sheet-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px 16px 16px;
}
.sheet-content.hidden { visibility: hidden; }

.sheet-loading {
  padding: 20px 0;
  color: #8b949e;
  text-align: center;
}

/* Breadcrumb */
.sheet-breadcrumb {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px;
  margin-bottom: 12px;
  font-size: 11px;
}

.crumb {
  background: none;
  border: none;
  font-family: inherit;
  font-size: 11px;
  color: #484f58;
  cursor: pointer;
  padding: 1px 3px;
  border-radius: 3px;
}
.crumb:hover { color: #8b949e; background: #161b22; }
.crumb-root { color: #484f58; }
.crumb-active { color: #58a6ff; cursor: default; }
.crumb-active:hover { background: none; }
.crumb-sep { color: #30363d; padding: 0 1px; }

/* Content fade transition */
.content-fade-enter-active { transition: opacity 0.15s ease, transform 0.15s ease; }
.content-fade-leave-active { transition: opacity 0.1s ease; }
.content-fade-enter-from { opacity: 0; transform: translateY(6px); }
.content-fade-leave-to   { opacity: 0; }

.sheet-plugin-header {
  margin-bottom: 14px;
}

.sheet-plugin-name {
  font-size: 15px;
  font-weight: 600;
  color: #e6edf3;
  margin: 0 0 4px;
  font-family: inherit;
}

.sheet-plugin-desc {
  font-size: 12px;
  color: #8b949e;
  margin: 0;
  line-height: 1.5;
}

.sheet-section {
  margin-bottom: 16px;
}

.sheet-section-title {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #484f58;
  margin-bottom: 8px;
}

/* Children chips */
.chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.ns-chip {
  background: #1a2840;
  border: 1px solid #1f3a5f;
  color: #58a6ff;
  font-family: inherit;
  font-size: 11px;
  padding: 3px 10px;
  border-radius: 12px;
  cursor: pointer;
}
.ns-chip:hover { background: #1f3a5f; }

/* Method rows */
.method-row-btn {
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: 8px 10px;
  background: #161b22;
  border: 1px solid #21262d;
  border-radius: 6px;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  margin-bottom: 6px;
  gap: 2px;
  transition: border-color 0.1s;
}
.method-row-btn:hover { border-color: #388bfd; background: #1a2840; }
.method-row-btn:focus { outline: none; border-color: #58a6ff; }

.method-row-left {
  display: flex;
  align-items: center;
  gap: 6px;
}

.method-row-name {
  font-size: 12px;
  color: #79c0ff;
}

.method-row-desc {
  font-size: 11px;
  color: #8b949e;
  line-height: 1.4;
}

.method-row-tag {
  font-size: 9px;
  padding: 1px 5px;
  border-radius: 3px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.method-row-tag.stream { background: #0d3350; color: #388bfd; }
.method-row-tag.bidir  { background: #2d1f4e; color: #a371f7; }

/* ── Method full-page overlay ────────────────────────────────── */
.method-page {
  position: absolute;
  inset: 0;
  background: #111114;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: 10;
}

.method-slide-enter-active, .method-slide-leave-active {
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
.method-slide-enter-from, .method-slide-leave-to { transform: translateY(100%); }

.method-page-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid #21262d;
  flex-shrink: 0;
}

.back-btn {
  background: none;
  border: none;
  color: #58a6ff;
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  padding: 2px 0;
  flex-shrink: 0;
}
.back-btn:hover { color: #79c0ff; }

.method-page-title {
  font-size: 12px;
  color: #e6edf3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.method-page-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
}
</style>
