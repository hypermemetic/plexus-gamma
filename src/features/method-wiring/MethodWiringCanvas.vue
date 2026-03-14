<template>
  <div class="wiring-root">
    <!-- Toolbar -->
    <div class="toolbar">
      <button class="tb-btn" @click="focusSidebar" title="Add method to canvas">[+ Method]</button>
      <button class="tb-btn tb-run" @click="runPipeline" :disabled="running" title="Execute pipeline">
        <span v-if="running" class="tb-spinner">◌</span>
        <span v-else>&#9654; Run</span>
      </button>
      <button class="tb-btn" @click="clearCanvas" title="Clear canvas">[&#10005; Clear]</button>
      <button class="tb-btn" @click="exportJson" title="Export pipeline as JSON">[Export JSON]</button>
      <span v-if="runError" class="tb-error">{{ runError }}</span>
    </div>

    <div class="body-split">
      <!-- Left sidebar: tree browser -->
      <aside class="sidebar">
        <input
          ref="sidebarInput"
          v-model="sidebarQuery"
          class="sidebar-search"
          placeholder="Search methods…"
          spellcheck="false"
        />

        <!-- Search mode: flat filtered list -->
        <template v-if="sidebarQuery">
          <div class="sidebar-list">
            <div
              v-for="item in filteredSearchMethods"
              :key="item.backendName + ':' + item.fullPath"
              class="sidebar-item"
              :title="item.method.description || item.fullPath"
              @click="addMethodEntry(item)"
            >
              <span class="sidebar-backend">[{{ item.backendName }}]</span>
              <span class="sidebar-path">{{ item.fullPath }}</span>
            </div>
            <div v-if="filteredSearchMethods.length === 0" class="sidebar-empty">No methods</div>
          </div>
        </template>

        <!-- Browse mode: tree + method detail -->
        <template v-else>
          <div class="sidebar-tree">
            <div v-for="conn in connections" :key="conn.name" class="be-group">
              <div class="be-header" @click="toggleBeCollapse(conn.name)">
                <span class="be-toggle">{{ beCollapsed[conn.name] ? '▸' : '▾' }}</span>
                <span class="be-label">{{ conn.name }}</span>
                <span v-if="sidebarLoading[conn.name]" class="be-spinner">◌</span>
              </div>
              <div v-if="!beCollapsed[conn.name]">
                <div v-if="sidebarLoading[conn.name] && !sidebarTrees[conn.name]" class="be-loading">
                  <span class="spinner">◌</span>
                </div>
                <PluginTreeNode
                  v-if="sidebarTrees[conn.name]"
                  :node="sidebarTrees[conn.name]!"
                  :selected-path="selectedTreeNode?.backendName === conn.name ? selectedTreeNode.node.path.join('.') : '__none__'"
                  :backend-name="conn.name"
                  @select="onTreeSelect(conn.name, $event)"
                />
              </div>
            </div>
            <div v-if="connections.length === 0" class="sidebar-empty">No backends</div>
          </div>

          <!-- Methods of selected tree node -->
          <template v-if="selectedTreeNode">
            <div class="method-divider">
              <span class="method-divider-label">{{ selectedTreeNodeLabel }}</span>
              <button class="method-divider-close" @click="selectedTreeNode = null" title="Close">✕</button>
            </div>
            <div class="sidebar-list">
              <div
                v-for="method in selectedNodeMethods"
                :key="method.name"
                class="sidebar-item"
                :title="method.description || method.name"
                @click="addFromTreeNode(method)"
              >
                <span class="sidebar-method">{{ method.name }}</span>
                <span v-if="method.streaming" class="method-tag stream">stream</span>
                <span v-if="method.bidirectional" class="method-tag bidir">bidir</span>
              </div>
              <div v-if="selectedNodeMethods.length === 0" class="sidebar-empty">No methods</div>
            </div>
          </template>
        </template>
      </aside>

      <!-- Right canvas -->
      <div class="canvas-wrap" ref="canvasWrap" @click="onCanvasClick" @mousemove="onMouseMove" @mouseup="onMouseUp">
        <!-- SVG overlay for edges -->
        <svg
          class="edge-svg"
          :viewBox="`0 0 ${svgW} ${svgH}`"
          :width="svgW"
          :height="svgH"
          @click.stop
        >
          <!-- Completed edges -->
          <g v-for="edge in edges" :key="edge.id">
            <path
              :d="edgePath(edge)"
              class="edge-path"
              :class="{ 'edge-hover': hoveredEdge === edge.id }"
              fill="none"
              @mouseenter="hoveredEdge = edge.id"
              @mouseleave="hoveredEdge = null"
              @click.stop="removeEdge(edge.id)"
            />
          </g>
          <!-- Pending edge (drawing in progress) -->
          <path
            v-if="pendingEdge"
            :d="pendingEdgePath"
            class="edge-path edge-pending"
            fill="none"
          />
        </svg>

        <!-- Nodes -->
        <div
          v-for="node in nodes"
          :key="node.id"
          class="wire-node"
          :class="{
            selected: selectedNodeId === node.id,
            'status-running': node.status === 'running',
            'status-done': node.status === 'done',
            'status-error': node.status === 'error',
          }"
          :style="{ left: `${node.pos.x}px`, top: `${node.pos.y}px` }"
          @mousedown.stop="startDrag($event, node.id)"
          @click.stop="selectNode(node.id)"
        >
          <!-- Status dot -->
          <span class="status-dot" :class="`status-dot-${node.status}`"></span>

          <!-- Method name -->
          <div class="node-title">{{ node.method.fullPath }}</div>

          <!-- Input ports (params) on the left -->
          <div class="node-ports-left">
            <div
              v-for="param in getParamNames(node)"
              :key="param"
              class="port-row port-row-left"
            >
              <div
                class="port port-in"
                :class="{ 'port-connected': isParamConnected(node.id, param), 'port-hover': hoveredPort?.nodeId === node.id && hoveredPort.param === param }"
                :title="`Input: ${param}`"
                @mouseenter="hoveredPort = { nodeId: node.id, param }"
                @mouseleave="hoveredPort = null"
                @click.stop="onInputPortClick(node.id, param)"
              ></div>
              <span class="port-label">{{ param }}</span>
            </div>
          </div>

          <!-- Output port on the right -->
          <div class="node-ports-right">
            <div
              class="port port-out"
              :class="{ 'port-hover': hoveredPort?.nodeId === node.id && hoveredPort.param === '__out' }"
              title="Output"
              @mouseenter="hoveredPort = { nodeId: node.id, param: '__out' }"
              @mouseleave="hoveredPort = null"
              @click.stop="onOutputPortClick(node.id)"
            ></div>
          </div>

          <!-- Inline param form when selected -->
          <div v-if="selectedNodeId === node.id && getParamNames(node).length > 0" class="param-form" @mousedown.stop @click.stop>
            <div class="param-form-title">Params</div>
            <div
              v-for="param in getParamNames(node)"
              :key="param"
              class="param-row"
            >
              <label class="param-label">{{ param }}</label>
              <input
                class="param-input"
                :placeholder="isParamConnected(node.id, param) ? '(wired)' : 'value'"
                :disabled="isParamConnected(node.id, param)"
                :value="nodeParamValue(node, param)"
                @input="setParam(node.id, param, ($event.target as HTMLInputElement).value)"
              />
            </div>
          </div>

          <!-- Result preview when done -->
          <div v-if="node.status === 'done' && node.result !== undefined" class="node-result" @mousedown.stop @click.stop>
            <span class="result-label">result:</span>
            <span class="result-value">{{ resultPreview(node.result) }}</span>
          </div>
          <div v-if="node.status === 'error' && node.result !== undefined" class="node-result node-result-error" @mousedown.stop @click.stop>
            <span class="result-label">error:</span>
            <span class="result-value">{{ String(node.result) }}</span>
          </div>
        </div>

        <!-- Empty state -->
        <div v-if="nodes.length === 0" class="canvas-empty">
          Click a method in the sidebar to add it to the canvas
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, nextTick } from 'vue'
import type { MethodEntry } from '../../components/CommandPalette.vue'
import { getSharedClient } from '../../lib/plexus/clientRegistry'
import { getCachedTree } from '../../lib/plexus/schemaCache'
import { flattenTree } from '../../schema-walker'
import type { PluginNode, MethodSchema } from '../../plexus-schema'
import PluginTreeNode from '../../components/PluginTreeNode.vue'

// ─── Props ────────────────────────────────────────────────────
const props = defineProps<{
  connections: { name: string; url: string }[]
  methodIndex: MethodEntry[]
}>()

// ─── Sidebar tree state ───────────────────────────────────────
const sidebarTrees   = reactive<Record<string, PluginNode>>({})
const sidebarLoading = reactive<Record<string, boolean>>({})
const beCollapsed    = reactive<Record<string, boolean>>({})

interface SelectedTreeNode { backendName: string; node: PluginNode }
const selectedTreeNode = ref<SelectedTreeNode | null>(null)

const selectedTreeNodeLabel = computed(() => {
  if (!selectedTreeNode.value) return ''
  const { backendName, node } = selectedTreeNode.value
  return node.path.length === 0 ? backendName : node.path.join('.')
})

const selectedNodeMethods = computed((): MethodSchema[] => {
  return selectedTreeNode.value?.node.schema.methods ?? []
})

async function loadSidebarTrees(): Promise<void> {
  for (const conn of props.connections) {
    if (!(conn.name in sidebarLoading)) {
      sidebarLoading[conn.name] = true
      const rpc = getSharedClient(conn.name, conn.url)
      getCachedTree(rpc, conn.name)
        .then(tree => { sidebarTrees[conn.name] = tree })
        .catch(() => { /* ignore */ })
        .finally(() => { sidebarLoading[conn.name] = false })
    }
  }
}

function toggleBeCollapse(name: string): void {
  beCollapsed[name] = !beCollapsed[name]
}

function onTreeSelect(backendName: string, node: PluginNode): void {
  selectedTreeNode.value = { backendName, node }
}

function addFromTreeNode(method: MethodSchema): void {
  if (!selectedTreeNode.value) return
  const { backendName, node } = selectedTreeNode.value
  const ns = node.path.length === 0 ? backendName : node.path.join('.')
  addNode({
    backend: backendName,
    fullPath: `${ns}.${method.name}`,
    path: node.path,
    method,
  })
}

function addMethodEntry(item: { backendName: string; fullPath: string; path: string[]; method: MethodSchema }): void {
  addNode({
    backend: item.backendName,
    fullPath: item.fullPath,
    path: item.path,
    method: item.method,
  })
}

// ─── Search (across all loaded trees) ────────────────────────
const sidebarQuery = ref('')
const sidebarInput = ref<HTMLInputElement | null>(null)

const allTreeMethods = computed(() => {
  const result: { backendName: string; fullPath: string; path: string[]; method: MethodSchema }[] = []
  for (const [name, tree] of Object.entries(sidebarTrees)) {
    for (const node of flattenTree(tree)) {
      const ns = node.path.length === 0 ? name : node.path.join('.')
      for (const method of node.schema.methods) {
        result.push({
          backendName: name,
          fullPath: `${ns}.${method.name}`,
          path: node.path,
          method,
        })
      }
    }
  }
  return result
})

const filteredSearchMethods = computed(() => {
  const q = sidebarQuery.value.toLowerCase()
  if (!q) return []
  return allTreeMethods.value
    .filter(m => m.fullPath.toLowerCase().includes(q) || m.backendName.toLowerCase().includes(q))
    .slice(0, 80)
})

function focusSidebar() {
  nextTick(() => sidebarInput.value?.focus())
}

// ─── RPC clients (shared registry) ───────────────────────────
function getClient(backend: string) {
  const conn = props.connections.find(c => c.name === backend)
  if (!conn) throw new Error(`No connection for backend "${backend}"`)
  return getSharedClient(backend, conn.url)
}

// ─── Data model ───────────────────────────────────────────────
interface WireNode {
  id: string
  method: MethodEntry
  pos: { x: number; y: number }
  params: Record<string, unknown>
  status: 'idle' | 'running' | 'done' | 'error'
  result: unknown
}

interface WireEdge {
  id: string
  fromNodeId: string
  toNodeId: string
  toParam: string
}

const nodes = ref<WireNode[]>([])
const edges = ref<WireEdge[]>([])
const selectedNodeId = ref<string | null>(null)
const running = ref(false)
const runError = ref<string | null>(null)

// ─── SVG dimensions (ResizeObserver) ─────────────────────────
const canvasWrap = ref<HTMLDivElement | null>(null)
const svgW = ref(800)
const svgH = ref(600)

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  loadSidebarTrees()
  if (canvasWrap.value) {
    resizeObserver = new ResizeObserver(entries => {
      const entry = entries[0]
      if (entry) {
        svgW.value = entry.contentRect.width
        svgH.value = entry.contentRect.height
      }
    })
    resizeObserver.observe(canvasWrap.value)
    svgW.value = canvasWrap.value.clientWidth
    svgH.value = canvasWrap.value.clientHeight
  }
})

onUnmounted(() => {
  resizeObserver?.disconnect()
})

// ─── Node IDs ─────────────────────────────────────────────────
let nodeCounter = 0
let edgeCounter = 0

function makeNodeId(): string { return `n${++nodeCounter}` }
function makeEdgeId(): string { return `e${++edgeCounter}` }

// ─── Add node ─────────────────────────────────────────────────
const GRID = 20

function snap(v: number): number { return Math.round(v / GRID) * GRID }

function addNode(entry: MethodEntry) {
  const baseX = snap(60 + (nodes.value.length % 4) * 240)
  const baseY = snap(60 + Math.floor(nodes.value.length / 4) * 180)
  const node: WireNode = {
    id: makeNodeId(),
    method: entry,
    pos: { x: baseX, y: baseY },
    params: {},
    status: 'idle',
    result: undefined,
  }
  nodes.value.push(node)
  selectedNodeId.value = node.id
}

// ─── Dragging ─────────────────────────────────────────────────
interface DragState {
  nodeId: string
  startMouseX: number
  startMouseY: number
  startNodeX: number
  startNodeY: number
}

let dragState: DragState | null = null

function startDrag(e: MouseEvent, nodeId: string) {
  const node = nodes.value.find(n => n.id === nodeId)
  if (!node) return
  dragState = {
    nodeId,
    startMouseX: e.clientX,
    startMouseY: e.clientY,
    startNodeX: node.pos.x,
    startNodeY: node.pos.y,
  }
  selectedNodeId.value = nodeId
}

function onMouseMove(e: MouseEvent) {
  if (dragState) {
    const node = nodes.value.find(n => n.id === dragState!.nodeId)
    if (node) {
      const dx = e.clientX - dragState.startMouseX
      const dy = e.clientY - dragState.startMouseY
      node.pos.x = snap(dragState.startNodeX + dx)
      node.pos.y = snap(dragState.startNodeY + dy)
    }
  }
  if (pendingEdge.value) {
    const rect = canvasWrap.value?.getBoundingClientRect()
    if (rect) {
      pendingEdge.value.toX = e.clientX - rect.left
      pendingEdge.value.toY = e.clientY - rect.top
    }
  }
}

function onMouseUp() {
  dragState = null
}

// ─── Port interaction ─────────────────────────────────────────
interface HoveredPort { nodeId: string; param: string }
interface PendingEdge { fromNodeId: string; fromX: number; fromY: number; toX: number; toY: number }

const hoveredPort = ref<HoveredPort | null>(null)
const pendingEdge = ref<PendingEdge | null>(null)
const hoveredEdge = ref<string | null>(null)

function outputPortPos(nodeId: string): { x: number; y: number } | null {
  const node = nodes.value.find(n => n.id === nodeId)
  if (!node) return null
  const el = canvasWrap.value?.querySelector<HTMLElement>(`.wire-node[data-id="${nodeId}"]`)
  if (el) {
    const rect = el.getBoundingClientRect()
    const wrap = canvasWrap.value!.getBoundingClientRect()
    return { x: rect.right - wrap.left, y: rect.top + rect.height / 2 - wrap.top }
  }
  return { x: node.pos.x + 200, y: node.pos.y + 40 }
}

function inputPortPos(nodeId: string, param: string): { x: number; y: number } | null {
  const node = nodes.value.find(n => n.id === nodeId)
  if (!node) return null
  const paramNames = getParamNames(node)
  const idx = paramNames.indexOf(param)
  if (idx < 0) return null
  return { x: node.pos.x, y: node.pos.y + 40 + idx * 22 + 8 }
}

function onOutputPortClick(fromNodeId: string) {
  if (pendingEdge.value) {
    if (pendingEdge.value.fromNodeId === fromNodeId) {
      pendingEdge.value = null
      return
    }
  }
  const pos = outputPortPos(fromNodeId)
  if (!pos) return
  pendingEdge.value = { fromNodeId, fromX: pos.x, fromY: pos.y, toX: pos.x, toY: pos.y }
}

function onInputPortClick(toNodeId: string, toParam: string) {
  if (!pendingEdge.value) return
  const { fromNodeId } = pendingEdge.value
  if (fromNodeId === toNodeId) { pendingEdge.value = null; return }
  edges.value = edges.value.filter(e => !(e.toNodeId === toNodeId && e.toParam === toParam))
  edges.value.push({
    id: makeEdgeId(),
    fromNodeId,
    toNodeId,
    toParam,
  })
  pendingEdge.value = null
}

function onCanvasClick() {
  pendingEdge.value = null
  selectedNodeId.value = null
}

function selectNode(nodeId: string) {
  selectedNodeId.value = selectedNodeId.value === nodeId ? null : nodeId
}

// ─── Edge paths (bezier) ──────────────────────────────────────
function edgePath(edge: WireEdge): string {
  const from = outputPortPos(edge.fromNodeId)
  const to = inputPortPos(edge.toNodeId, edge.toParam)
  if (!from || !to) return ''
  return bezierPath(from.x, from.y, to.x, to.y)
}

const pendingEdgePath = computed(() => {
  if (!pendingEdge.value) return ''
  const { fromX, fromY, toX, toY } = pendingEdge.value
  return bezierPath(fromX, fromY, toX, toY)
})

function bezierPath(x1: number, y1: number, x2: number, y2: number): string {
  const cx = (x1 + x2) / 2
  return `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`
}

function removeEdge(edgeId: string) {
  edges.value = edges.value.filter(e => e.id !== edgeId)
}

// ─── Params ───────────────────────────────────────────────────
function getParamNames(node: WireNode): string[] {
  const params = node.method.method.params
  if (!params || typeof params !== 'object') return []
  const p = params as Record<string, unknown>
  if (p['type'] === 'object' && p['properties'] && typeof p['properties'] === 'object') {
    return Object.keys(p['properties'] as Record<string, unknown>)
  }
  return []
}

function isParamConnected(nodeId: string, param: string): boolean {
  return edges.value.some(e => e.toNodeId === nodeId && e.toParam === param)
}

function nodeParamValue(node: WireNode, param: string): string {
  const v = node.params[param]
  if (v === undefined || v === null) return ''
  return String(v)
}

function setParam(nodeId: string, param: string, value: string) {
  const node = nodes.value.find(n => n.id === nodeId)
  if (!node) return
  node.params[param] = value
}

// ─── Topological sort ─────────────────────────────────────────
function topoSort(nodeList: WireNode[], edgeList: WireEdge[]): WireNode[] {
  const inDegree = new Map<string, number>()
  const dependants = new Map<string, string[]>()
  for (const n of nodeList) { inDegree.set(n.id, 0); dependants.set(n.id, []) }
  for (const e of edgeList) {
    inDegree.set(e.toNodeId, (inDegree.get(e.toNodeId) ?? 0) + 1)
    dependants.get(e.fromNodeId)?.push(e.toNodeId)
  }
  const queue: string[] = []
  for (const [id, deg] of inDegree) { if (deg === 0) queue.push(id) }
  const result: WireNode[] = []
  while (queue.length > 0) {
    const id = queue.shift()!
    const node = nodeList.find(n => n.id === id)
    if (node) result.push(node)
    for (const dep of dependants.get(id) ?? []) {
      const newDeg = (inDegree.get(dep) ?? 1) - 1
      inDegree.set(dep, newDeg)
      if (newDeg === 0) queue.push(dep)
    }
  }
  return result
}

// ─── Pipeline execution ───────────────────────────────────────
async function runPipeline() {
  if (running.value || nodes.value.length === 0) return
  running.value = true
  runError.value = null

  for (const node of nodes.value) {
    node.status = 'idle'
    node.result = undefined
  }

  const sorted = topoSort(nodes.value, edges.value)
  const nodeResults = new Map<string, unknown>()

  try {
    for (const node of sorted) {
      node.status = 'running'
      try {
        const client = getClient(node.method.backend)
        const resolvedParams: Record<string, unknown> = { ...node.params }
        for (const edge of edges.value.filter(e => e.toNodeId === node.id)) {
          const upstreamResult = nodeResults.get(edge.fromNodeId)
          if (upstreamResult !== undefined) {
            resolvedParams[edge.toParam] = upstreamResult
          }
        }

        const finalParams: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(resolvedParams)) {
          if (typeof v === 'string') {
            try { finalParams[k] = JSON.parse(v) } catch { finalParams[k] = v }
          } else {
            finalParams[k] = v
          }
        }

        let firstDataResult: unknown = undefined
        for await (const item of client.call(node.method.fullPath, finalParams)) {
          if (item.type === 'data') {
            if (firstDataResult === undefined) firstDataResult = item.content
          } else if (item.type === 'error') {
            throw new Error(item.message)
          }
        }
        nodeResults.set(node.id, firstDataResult)
        node.result = firstDataResult
        node.status = 'done'
      } catch (err) {
        node.status = 'error'
        node.result = err instanceof Error ? err.message : String(err)
      }
    }
  } finally {
    running.value = false
  }
}

// ─── Toolbar actions ──────────────────────────────────────────
function clearCanvas() {
  nodes.value = []
  edges.value = []
  selectedNodeId.value = null
  pendingEdge.value = null
  runError.value = null
}

function exportJson() {
  const pipeline = {
    nodes: nodes.value.map(n => ({
      id: n.id,
      method: n.method.fullPath,
      backend: n.method.backend,
      pos: n.pos,
      params: n.params,
    })),
    edges: edges.value.map(e => ({
      id: e.id,
      from: e.fromNodeId,
      to: e.toNodeId,
      toParam: e.toParam,
    })),
  }
  const json = JSON.stringify(pipeline, null, 2)
  navigator.clipboard.writeText(json).catch(() => {
    alert(json)
  })
}

// ─── Misc helpers ─────────────────────────────────────────────
function resultPreview(result: unknown): string {
  if (result === null || result === undefined) return 'null'
  const s = JSON.stringify(result)
  return s.length > 120 ? s.slice(0, 120) + '…' : s
}
</script>

<style scoped>
/* ── Root layout ─────────────────────────────────────────────── */
.wiring-root {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  background: #080a0e;
  color: #c9d1d9;
  font-family: 'Berkeley Mono', 'Fira Code', 'Cascadia Code', ui-monospace, monospace;
  font-size: 12px;
  overflow: hidden;
}

/* ── Toolbar ─────────────────────────────────────────────────── */
.toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 12px;
  background: #0a0a0c;
  border-bottom: 1px solid #21262d;
  flex-shrink: 0;
}

.tb-btn {
  background: #111114;
  border: 1px solid #30363d;
  color: #8b949e;
  font-family: inherit;
  font-size: 11px;
  padding: 3px 10px;
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
}
.tb-btn:hover { border-color: #58a6ff; color: #58a6ff; }
.tb-btn:disabled { opacity: 0.4; cursor: default; }

.tb-run {
  border-color: #1f3a5f;
  color: #58a6ff;
  background: #0d1a2a;
}
.tb-run:not(:disabled):hover { background: #1a2840; }

@keyframes tb-pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
.tb-spinner { display: inline-block; animation: tb-pulse 1s ease-in-out infinite; }

.tb-error { color: #f85149; font-size: 11px; margin-left: 8px; }

/* ── Body split ──────────────────────────────────────────────── */
.body-split {
  display: flex;
  flex: 1;
  overflow: hidden;
  min-height: 0;
}

/* ── Sidebar ─────────────────────────────────────────────────── */
.sidebar {
  width: 240px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #21262d;
  background: #0a0c10;
  overflow: hidden;
}

.sidebar-search {
  background: #111114;
  border: none;
  border-bottom: 1px solid #21262d;
  color: #c9d1d9;
  font-family: inherit;
  font-size: 11px;
  padding: 7px 10px;
  outline: none;
  flex-shrink: 0;
}
.sidebar-search::placeholder { color: #484f58; }
.sidebar-search:focus { border-bottom-color: #58a6ff; }

/* Tree browser */
.sidebar-tree {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}

.be-group { border-bottom: 1px solid #14171b; }

.be-header {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 10px;
  cursor: pointer;
  user-select: none;
  background: #0a0c10;
}
.be-header:hover { background: #0f1318; }

.be-toggle { font-size: 10px; color: #484f58; width: 10px; flex-shrink: 0; }

.be-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: #58a6ff;
  flex: 1;
}

.be-spinner { font-size: 10px; color: #484f58; }

.be-loading {
  padding: 6px 10px;
  color: #484f58;
  font-size: 10px;
  display: flex;
  align-items: center;
  gap: 5px;
}

@keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
.spinner { animation: pulse 1.2s ease-in-out infinite; }

/* Method divider */
.method-divider {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 10px;
  background: #111419;
  border-top: 1px solid #21262d;
  border-bottom: 1px solid #21262d;
  flex-shrink: 0;
}

.method-divider-label {
  font-size: 10px;
  color: #58a6ff;
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
  flex: 1;
}

.method-divider-close {
  background: none;
  border: none;
  color: #484f58;
  font-size: 11px;
  cursor: pointer;
  padding: 0 2px;
  line-height: 1;
  flex-shrink: 0;
}
.method-divider-close:hover { color: #8b949e; }

/* Method + search results list */
.sidebar-list { overflow-y: auto; }

.sidebar-item {
  padding: 5px 10px;
  cursor: pointer;
  border-bottom: 1px solid #14171b;
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
}
.sidebar-item:hover { background: #161b22; }

.sidebar-backend { font-size: 10px; color: #484f58; }
.sidebar-path    { font-size: 11px; color: #c9d1d9; word-break: break-all; flex: 1; }
.sidebar-method  { font-size: 11px; color: #79c0ff; flex: 1; }

.method-tag {
  font-size: 9px;
  padding: 1px 4px;
  border-radius: 3px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  flex-shrink: 0;
}
.method-tag.stream { background: #0d3350; color: #388bfd; }
.method-tag.bidir  { background: #2d1f4e; color: #a371f7; }

.sidebar-empty { padding: 12px 10px; color: #484f58; font-size: 11px; }

/* ── Canvas ──────────────────────────────────────────────────── */
.canvas-wrap {
  flex: 1;
  position: relative;
  overflow: hidden;
  background-color: #080a0e;
  background-image: radial-gradient(circle, #1e2530 1px, transparent 1px);
  background-size: 20px 20px;
  cursor: default;
  min-width: 0;
}

.edge-svg {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: visible;
}

.edge-path {
  stroke: #1f3a5f;
  stroke-width: 2;
  pointer-events: stroke;
  cursor: pointer;
  transition: stroke 0.15s;
}
.edge-path.edge-hover { stroke: #58a6ff; }
.edge-path.edge-pending { stroke: #3a5a7a; stroke-dasharray: 5 4; }

/* ── Wire node ───────────────────────────────────────────────── */
.wire-node {
  position: absolute;
  min-width: 200px;
  max-width: 280px;
  background: #111114;
  border: 1px solid #21262d;
  border-radius: 6px;
  padding: 8px 10px 8px 10px;
  cursor: grab;
  user-select: none;
  box-sizing: border-box;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.wire-node:active { cursor: grabbing; }
.wire-node.selected { border-color: #58a6ff; box-shadow: 0 0 0 1px #58a6ff33; }

@keyframes node-pulse { 0%, 100% { box-shadow: 0 0 0 1px #58a6ff22; } 50% { box-shadow: 0 0 0 3px #58a6ff44; } }
.wire-node.status-running { border-color: #58a6ff; animation: node-pulse 1s ease-in-out infinite; }
.wire-node.status-done    { border-color: #3fb950; }
.wire-node.status-error   { border-color: #f85149; }

.status-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  margin-right: 6px;
  vertical-align: middle;
  flex-shrink: 0;
}
.status-dot-idle    { background: #484f58; }
.status-dot-running { background: #58a6ff; }
.status-dot-done    { background: #3fb950; }
.status-dot-error   { background: #f85149; }

.node-title {
  display: inline;
  font-size: 11px;
  color: #c9d1d9;
  word-break: break-all;
  vertical-align: middle;
  font-weight: 600;
}

/* ── Ports ───────────────────────────────────────────────────── */
.node-ports-left {
  margin-top: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.node-ports-right {
  position: absolute;
  right: -6px;
  top: 50%;
  transform: translateY(-50%);
}

.port-row { display: flex; align-items: center; gap: 5px; }
.port-row-left { margin-left: -18px; }

.port {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #30363d;
  border: 1px solid #484f58;
  cursor: crosshair;
  flex-shrink: 0;
  transition: background 0.12s, border-color 0.12s;
}
.port:hover, .port.port-hover { background: #58a6ff; border-color: #58a6ff; }
.port.port-connected { background: #1f3a5f; border-color: #58a6ff; }

.port-label { font-size: 10px; color: #8b949e; }

/* ── Param form ──────────────────────────────────────────────── */
.param-form {
  margin-top: 8px;
  border-top: 1px solid #21262d;
  padding-top: 6px;
  cursor: default;
}

.param-form-title { font-size: 10px; color: #484f58; margin-bottom: 4px; letter-spacing: 0.05em; }

.param-row { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
.param-label { font-size: 10px; color: #8b949e; min-width: 50px; flex-shrink: 0; }
.param-input {
  flex: 1;
  background: #0a0c10;
  border: 1px solid #30363d;
  border-radius: 3px;
  color: #c9d1d9;
  font-family: inherit;
  font-size: 10px;
  padding: 2px 5px;
  outline: none;
  min-width: 0;
}
.param-input:focus { border-color: #58a6ff; }
.param-input:disabled { color: #484f58; background: #0a0c10; }

/* ── Result preview ──────────────────────────────────────────── */
.node-result {
  margin-top: 6px;
  border-top: 1px solid #21262d;
  padding-top: 4px;
  cursor: default;
  display: flex;
  gap: 5px;
  align-items: flex-start;
}

.result-label { font-size: 10px; color: #484f58; flex-shrink: 0; }
.result-value {
  font-size: 10px;
  color: #3fb950;
  word-break: break-all;
  overflow: hidden;
  max-height: 60px;
  overflow-y: auto;
}
.node-result-error .result-value { color: #f85149; }

/* ── Canvas empty state ──────────────────────────────────────── */
.canvas-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #30363d;
  font-size: 13px;
  pointer-events: none;
  letter-spacing: 0.03em;
}
</style>
