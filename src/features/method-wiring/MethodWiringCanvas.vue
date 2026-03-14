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
      <!-- Left sidebar: drill-down browser + transforms -->
      <aside class="sidebar">
        <!-- Search -->
        <input
          ref="sidebarInput"
          v-model="sidebarQuery"
          class="sidebar-search"
          placeholder="Search methods…"
          spellcheck="false"
        />

        <!-- Search mode: flat filtered list -->
        <template v-if="sidebarQuery">
          <div class="sb-panel sb-list">
            <div
              v-for="item in filteredSearchMethods"
              :key="item.backendName + ':' + item.fullPath"
              class="sb-row sb-row-method"
              draggable="true"
              :title="item.method.description || item.fullPath"
              @dragstart="onSearchDragStart($event, item)"
              @click="addMethodEntry(item)"
            >
              <span class="sb-row-icon sb-method-icon">ƒ</span>
              <div class="sb-row-body">
                <span class="sb-row-name">{{ item.fullPath }}</span>
                <span class="sb-row-desc sb-row-backend">[{{ item.backendName }}]</span>
              </div>
              <div class="sb-row-tags">
                <span v-if="item.method.streaming" class="method-tag stream">stream</span>
              </div>
            </div>
            <div v-if="filteredSearchMethods.length === 0" class="sb-empty">No methods</div>
          </div>
        </template>

        <!-- Browse mode: drill-down -->
        <template v-else>
          <!-- Breadcrumbs -->
          <div class="sb-crumbs">
            <button class="sb-crumb sb-crumb-home" @click="drillHome" title="All backends">⌂</button>
            <template v-for="(level, i) in drillStack" :key="i">
              <span class="sb-crumb-sep">›</span>
              <button class="sb-crumb" @click="drillTo(i)">
                {{ level.node.path.length === 0 ? level.backend : level.node.path[level.node.path.length - 1] }}
              </button>
            </template>
          </div>

          <!-- Home: backends list -->
          <div v-if="drillStack.length === 0" class="sb-panel">
            <div
              v-for="conn in connections"
              :key="conn.name"
              class="sb-row sb-row-backend"
              @click="drillIntoBackend(conn.name)"
            >
              <span v-if="sidebarLoading[conn.name]" class="sb-row-spinner">◌</span>
              <span v-else class="sb-row-icon">◈</span>
              <span class="sb-row-name">{{ conn.name }}</span>
              <span class="sb-row-chevron">›</span>
            </div>
            <div v-if="connections.length === 0" class="sb-empty">No backends connected</div>
          </div>

          <!-- Drill: current level children + methods -->
          <div v-else class="sb-panel">
            <!-- Hub children -->
            <div
              v-for="child in drillChildren"
              :key="child.path.join('.')"
              class="sb-row sb-row-hub"
              @click="drillInto(child)"
            >
              <span class="sb-row-icon">◈</span>
              <div class="sb-row-body">
                <span class="sb-row-name">{{ child.path[child.path.length - 1] }}</span>
                <span v-if="child.children.length" class="sb-row-meta">{{ child.children.length }} namespaces</span>
              </div>
              <span class="sb-row-chevron">›</span>
            </div>

            <!-- Methods -->
            <div
              v-for="method in drillMethods"
              :key="method.name"
              class="sb-row sb-row-method"
              draggable="true"
              :title="method.description || method.name"
              @dragstart="onMethodDragStart($event, method)"
              @click="addFromCurrentNode(method)"
            >
              <span class="sb-row-icon sb-method-icon">ƒ</span>
              <div class="sb-row-body">
                <span class="sb-row-name">{{ method.name }}</span>
                <span v-if="method.description" class="sb-row-desc">{{ method.description }}</span>
              </div>
              <div class="sb-row-tags">
                <span v-if="method.streaming" class="method-tag stream">stream</span>
                <span v-if="method.bidirectional" class="method-tag bidir">bidir</span>
              </div>
            </div>

            <div v-if="drillChildren.length === 0 && drillMethods.length === 0" class="sb-empty">
              No items here
            </div>
          </div>

          <!-- Transforms section -->
          <div class="transforms-section">
            <div class="transforms-header">Transforms</div>
            <div class="transforms-row">
              <button class="transform-btn" @click="addTransformNode('extract')">Extract</button>
              <button class="transform-btn" @click="addTransformNode('template')">Template</button>
              <button class="transform-btn" @click="addTransformNode('merge')">Merge</button>
              <button class="transform-btn" @click="addTransformNode('script')">Script</button>
            </div>
          </div>
        </template>
      </aside>

      <!-- Right canvas -->
      <div
        class="canvas-wrap"
        ref="canvasWrap"
        @click="onCanvasClick"
        @contextmenu.prevent="onCanvasClick"
        @mousemove="onMouseMove"
        @mouseup="onMouseUp"
        @dragover.prevent="onCanvasDragOver"
        @drop="onCanvasDrop"
      >
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
            <!-- Routing badge — click to open picker -->
            <g
              v-for="mid in edgeMidpoint(edge) ? [edgeMidpoint(edge)!] : []"
              :key="'badge'"
              class="edge-badge-g"
              @click.stop="openRoutingPicker($event, edge.id)"
              @mouseenter="hoveredEdge = edge.id"
              @mouseleave="hoveredEdge = null"
            >
              <rect
                :x="mid.x - 17" :y="mid.y - 9"
                width="34" height="18" rx="3"
                class="edge-badge-bg"
                :class="`route-${edge.routing}`"
              />
              <text :x="mid.x" :y="mid.y + 4" class="edge-badge-text" text-anchor="middle">{{ ROUTE_LABELS[edge.routing] }}</text>
            </g>
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
          :data-id="node.id"
          :class="{
            selected: selectedNodeId === node.id,
            'status-running': node.status === 'running',
            'status-done': node.status === 'done',
            'status-error': node.status === 'error',
          }"
          :style="{
            left: `${node.pos.x}px`,
            top: `${node.pos.y}px`,
            width: `${node.w}px`,
            background: nodeBackground(node.kind),
          }"
          @mousedown.stop="startDrag($event, node.id)"
          @click.stop
          @contextmenu.prevent.stop="showContextMenu($event, node.id)"
        >
          <!-- Status dot -->
          <span class="status-dot" :class="`status-dot-${node.status}`"></span>

          <!-- Node title -->
          <div class="node-title">{{ nodeTitle(node) }}</div>

          <!-- Input ports (params) on the left — @mousedown.stop prevents node drag/select when clicking ports -->
          <div class="node-ports-left" @mousedown.stop>
            <div
              v-for="param in getParamNames(node)"
              :key="param"
              class="port-row port-row-left"
            >
              <div
                class="port port-in"
                :class="{ 'port-connected': isParamConnected(node.id, param), 'port-hover': hoveredPort?.nodeId === node.id && hoveredPort.param === param }"
                :title="`Input: ${param}`"
                @mousedown.stop
                @mouseenter="hoveredPort = { nodeId: node.id, param }"
                @mouseleave="hoveredPort = null"
                @click.stop="onInputPortClick(node.id, param)"
              ></div>
              <span class="port-label">{{ param }}</span>
            </div>
          </div>

          <!-- Output port on the right — @mousedown.stop prevents node drag/select when clicking ports -->
          <div class="node-ports-right" @mousedown.stop>
            <div
              class="port port-out"
              :class="{ 'port-hover': hoveredPort?.nodeId === node.id && hoveredPort.param === '__out' }"
              title="Output"
              @mousedown.stop
              @mouseenter="hoveredPort = { nodeId: node.id, param: '__out' }"
              @mouseleave="hoveredPort = null"
              @click.stop="onOutputPortClick(node.id)"
            ></div>
          </div>

          <!-- Returns schema (RPC only, when selected) -->
          <div v-if="selectedNodeId === node.id && node.kind === 'rpc' && node.method?.method.returns" class="returns-section" @mousedown.stop @click.stop>
            <div class="returns-title">returns</div>
            <pre class="returns-schema">{{ formatSchema(node.method.method.returns) }}</pre>
          </div>

          <!-- Inline param/config when selected -->
          <template v-if="selectedNodeId === node.id">
            <!-- RPC: SchemaField if schema available, else plain inputs -->
            <template v-if="node.kind === 'rpc'">
              <div v-if="getParamNames(node).length > 0" class="param-form" @mousedown.stop @click.stop>
                <div class="param-form-title">
                  Params
                  <span v-if="availableRefIds(node.id).length" class="param-hint">
                    ref: {{ availableRefIds(node.id).map(id => '{' + id + '}').join(' ') }}
                  </span>
                </div>
                <SchemaField
                  v-if="resolvedParamSchema(node)"
                  name="params"
                  :schema="resolvedParamSchema(node)!"
                  :model-value="node.params"
                  @update:model-value="node.params = $event as Record<string, unknown>"
                  class="param-schema-field"
                  @mousedown.stop
                  @click.stop
                />
                <template v-else>
                  <div v-for="param in getParamNames(node)" :key="param" class="param-row">
                    <label class="param-label">{{ param }}</label>
                    <input
                      class="param-input"
                      :placeholder="isParamConnected(node.id, param) ? '(wired)' : 'value'"
                      :disabled="isParamConnected(node.id, param)"
                      :value="nodeParamValue(node, param)"
                      @input="setParam(node.id, param, ($event.target as HTMLInputElement).value)"
                    />
                  </div>
                </template>
              </div>
            </template>

            <!-- Transform config -->
            <template v-else>
              <div class="param-form" @mousedown.stop @click.stop>
                <!-- Extract -->
                <template v-if="node.kind === 'extract'">
                  <div class="param-form-title">dot-path</div>
                  <input v-model="node.transform.path" class="param-input" placeholder="e.g. result.text" />
                </template>

                <!-- Template -->
                <template v-else-if="node.kind === 'template'">
                  <div class="param-form-title">template <span class="param-hint">use &#123;&#123;name&#125;&#125;</span></div>
                  <textarea v-model="node.transform.template" class="transform-textarea" placeholder="Hello {{input}}" rows="2" />
                  <div class="param-form-title" style="margin-top:6px">ports</div>
                  <div v-for="(_, pi) in node.transform.inputNames" :key="pi" class="param-row">
                    <input v-model="node.transform.inputNames[pi]" class="param-input param-port-name" placeholder="port name" />
                    <button class="port-del-btn" @click.stop="node.transform.inputNames.splice(pi, 1)" title="Remove">✕</button>
                  </div>
                  <button class="add-port-btn" @click.stop="node.transform.inputNames.push('port' + node.transform.inputNames.length)">+ port</button>
                </template>

                <!-- Merge -->
                <template v-else-if="node.kind === 'merge'">
                  <div class="param-form-title">ports</div>
                  <div v-for="(_, pi) in node.transform.inputNames" :key="pi" class="param-row">
                    <input v-model="node.transform.inputNames[pi]" class="param-input param-port-name" placeholder="field name" />
                    <button class="port-del-btn" @click.stop="node.transform.inputNames.splice(pi, 1)" title="Remove">✕</button>
                  </div>
                  <button class="add-port-btn" @click.stop="node.transform.inputNames.push('field' + node.transform.inputNames.length)">+ port</button>
                </template>

                <!-- Script -->
                <template v-else-if="node.kind === 'script'">
                  <div class="param-form-title">code <span class="param-hint">fn(input)</span></div>
                  <textarea v-model="node.transform.code" class="transform-textarea" placeholder="x => x.result" rows="3" />
                </template>
              </div>
            </template>
          </template>

          <!-- Result preview when done -->
          <div v-if="node.status === 'done' && node.result !== undefined" class="node-result" @mousedown.stop @click.stop>
            <span class="result-label">result:</span>
            <span class="result-value">{{ resultPreview(node.result) }}</span>
          </div>
          <div v-if="node.status === 'error' && node.result !== undefined" class="node-result node-result-error" @mousedown.stop @click.stop>
            <span class="result-label">error:</span>
            <span class="result-value">{{ String(node.result) }}</span>
          </div>

          <!-- Resize handle (bottom-right corner) -->
          <div class="resize-handle" @mousedown.stop="startResize($event, node.id)" title="Drag to resize"></div>
        </div>

        <!-- Empty state -->
        <div v-if="nodes.length === 0" class="canvas-empty">
          Drag a method from the sidebar, or click one to add it
        </div>

        <!-- Context menu -->
        <div
          v-if="contextMenu"
          class="ctx-menu"
          :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
          @mousedown.stop
          @click.stop
        >
          <button class="ctx-item ctx-item-danger" @click="deleteNode(contextMenu!.nodeId)">Delete node</button>
          <button class="ctx-item" @click="disconnectNode(contextMenu!.nodeId)">Disconnect edges</button>
          <button class="ctx-item" @click="contextMenu = null">Cancel</button>
        </div>

        <!-- Routing picker -->
        <div
          v-if="routingPicker"
          class="routing-picker"
          :style="{ left: `${routingPicker.x}px`, top: `${routingPicker.y + 16}px` }"
          @mousedown.stop
          @click.stop
        >
          <div class="routing-picker-modes">
            <button
              v-for="mode in ROUTE_MODES" :key="mode"
              class="route-mode-btn"
              :class="{ active: getEdge(routingPicker.edgeId)?.routing === mode }"
              :title="mode"
              @click="setEdgeRouting(routingPicker.edgeId, mode)"
            >{{ ROUTE_LABELS[mode] }}</button>
          </div>
          <template v-if="getEdge(routingPicker.edgeId)?.routing === 'concat'">
            <input
              class="routing-config-input"
              placeholder="separator (default: newline)"
              :value="getEdge(routingPicker.edgeId)!.routeConfig.separator"
              @input="setEdgeRouteConfig(routingPicker.edgeId, 'separator', ($event.target as HTMLInputElement).value)"
            />
          </template>
          <template v-if="getEdge(routingPicker.edgeId)?.routing === 'filter'">
            <input
              class="routing-config-input"
              placeholder="predicate: x => true"
              :value="getEdge(routingPicker.edgeId)!.routeConfig.predicate"
              @input="setEdgeRouteConfig(routingPicker.edgeId, 'predicate', ($event.target as HTMLInputElement).value)"
            />
          </template>
          <template v-if="getEdge(routingPicker.edgeId)?.routing === 'reduce'">
            <input
              class="routing-config-input"
              placeholder="reducer: (acc, x) => acc + x"
              :value="getEdge(routingPicker.edgeId)!.routeConfig.reducer"
              @input="setEdgeRouteConfig(routingPicker.edgeId, 'reducer', ($event.target as HTMLInputElement).value)"
            />
            <input
              class="routing-config-input"
              placeholder='initial (JSON, e.g. "")'
              :value="getEdge(routingPicker.edgeId)!.routeConfig.initial"
              @input="setEdgeRouteConfig(routingPicker.edgeId, 'initial', ($event.target as HTMLInputElement).value)"
            />
          </template>
          <button class="routing-del-btn" @click="removeEdge(routingPicker.edgeId)">delete edge</button>
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
import SchemaField from '../../components/SchemaField.vue'
import type { JsonSchema } from '../../components/SchemaField.vue'

// ─── Props ────────────────────────────────────────────────────
const props = defineProps<{
  connections: { name: string; url: string }[]
  methodIndex: MethodEntry[]
}>()

// ─── Sidebar: drill-down state ────────────────────────────────
const sidebarTrees   = reactive<Record<string, PluginNode>>({})
const sidebarLoading = reactive<Record<string, boolean>>({})

interface DrillLevel { backend: string; node: PluginNode }
const drillStack = ref<DrillLevel[]>([])

const drillCurrent = computed((): DrillLevel | null =>
  drillStack.value[drillStack.value.length - 1] ?? null
)

const drillChildren = computed((): PluginNode[] =>
  drillCurrent.value?.node.children ?? []
)

const drillMethods = computed((): MethodSchema[] =>
  drillCurrent.value?.node.schema.methods ?? []
)

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

function drillHome(): void {
  drillStack.value = []
}

function drillTo(index: number): void {
  drillStack.value = drillStack.value.slice(0, index + 1)
}

async function drillIntoBackend(name: string): Promise<void> {
  if (sidebarTrees[name]) {
    drillStack.value = [{ backend: name, node: sidebarTrees[name] }]
    return
  }
  // Load on demand if not yet fetched
  sidebarLoading[name] = true
  const conn = props.connections.find(c => c.name === name)
  if (!conn) return
  try {
    const rpc = getSharedClient(conn.name, conn.url)
    const tree = await getCachedTree(rpc, name)
    sidebarTrees[name] = tree
    drillStack.value = [{ backend: name, node: tree }]
  } catch {
    // ignore
  } finally {
    sidebarLoading[name] = false
  }
}

function drillInto(child: PluginNode): void {
  const current = drillCurrent.value
  if (!current) return
  drillStack.value = [...drillStack.value, { backend: current.backend, node: child }]
}

function addFromCurrentNode(method: MethodSchema): void {
  const current = drillCurrent.value
  if (!current) return
  const { backend, node } = current
  const ns = node.path.length === 0 ? backend : node.path.join('.')
  addNode({
    backend,
    fullPath: `${ns}.${method.name}`,
    path: node.path,
    method,
  })
}

// ─── Drag from sidebar ────────────────────────────────────────
function onMethodDragStart(e: DragEvent, method: MethodSchema): void {
  const current = drillCurrent.value
  if (!current) return
  const { backend, node } = current
  const ns = node.path.length === 0 ? backend : node.path.join('.')
  const data: MethodEntry = { backend, fullPath: `${ns}.${method.name}`, path: node.path, method }
  e.dataTransfer?.setData('application/x-plexus-method', JSON.stringify(data))
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy'
}

function onSearchDragStart(e: DragEvent, item: { backendName: string; fullPath: string; path: string[]; method: MethodSchema }): void {
  const data: MethodEntry = { backend: item.backendName, fullPath: item.fullPath, path: item.path, method: item.method }
  e.dataTransfer?.setData('application/x-plexus-method', JSON.stringify(data))
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy'
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

function addMethodEntry(item: { backendName: string; fullPath: string; path: string[]; method: MethodSchema }): void {
  addNode({ backend: item.backendName, fullPath: item.fullPath, path: item.path, method: item.method })
}

// ─── RPC clients (shared registry) ───────────────────────────
function getClient(backend: string) {
  const conn = props.connections.find(c => c.name === backend)
  if (!conn) throw new Error(`No connection for backend "${backend}"`)
  return getSharedClient(backend, conn.url)
}

// ─── Data model ───────────────────────────────────────────────
type NodeKind = 'rpc' | 'extract' | 'template' | 'merge' | 'script'

interface WireNode {
  id: string
  kind: NodeKind
  method?: MethodEntry  // 'rpc' only
  transform: {
    path: string
    template: string
    code: string
    inputNames: string[]
  }
  pos: { x: number; y: number }
  w: number                        // node width in px (min 160, default 220)
  params: Record<string, unknown>
  status: 'idle' | 'running' | 'done' | 'error'
  result: unknown
}

type RouteMode = 'auto' | 'each' | 'collect' | 'last' | 'first' | 'concat' | 'filter' | 'reduce'

interface RouteConfig {
  separator: string
  predicate: string
  reducer: string
  initial: string
}

interface WireEdge {
  id: string
  fromNodeId: string
  toNodeId: string
  toParam: string
  routing: RouteMode
  routeConfig: RouteConfig
}

const ROUTE_MODES: RouteMode[] = ['auto', 'each', 'collect', 'last', 'first', 'concat', 'filter', 'reduce']
const ROUTE_LABELS: Record<RouteMode, string> = {
  auto:    '·',
  each:    '×N',
  collect: '[…]',
  last:    'last',
  first:   '1st',
  concat:  'str',
  filter:  'flt',
  reduce:  'fold',
}

const nodes = ref<WireNode[]>([])
const edges = ref<WireEdge[]>([])
const selectedNodeId = ref<string | null>(null)
const running = ref(false)
// Bump to force edge SVG re-render after node resize (DOM positions change non-reactively)
const layoutTick = ref(0)
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

function addNode(entry: MethodEntry, pos?: { x: number; y: number }) {
  const baseX = pos?.x ?? snap(60 + (nodes.value.length % 4) * 240)
  const baseY = pos?.y ?? snap(60 + Math.floor(nodes.value.length / 4) * 180)
  const node: WireNode = {
    id: makeNodeId(),
    kind: 'rpc',
    method: entry,
    transform: { path: '', template: '', code: '', inputNames: [] },
    pos: { x: baseX, y: baseY },
    w: 220,
    params: {},
    status: 'idle',
    result: undefined,
  }
  nodes.value.push(node)
  selectedNodeId.value = node.id
}

function addTransformNode(kind: Exclude<NodeKind, 'rpc'>) {
  const baseX = snap(60 + (nodes.value.length % 4) * 240)
  const baseY = snap(60 + Math.floor(nodes.value.length / 4) * 180)
  const node: WireNode = {
    id: makeNodeId(),
    kind,
    method: undefined,
    transform: {
      path: '',
      template: '',
      code: '',
      inputNames: kind === 'template' || kind === 'merge' ? ['input'] : [],
    },
    pos: { x: baseX, y: baseY },
    w: 220,
    params: {},
    status: 'idle',
    result: undefined,
  }
  nodes.value.push(node)
  selectedNodeId.value = node.id
}

// ─── Node appearance helpers ──────────────────────────────────
function nodeBackground(kind: NodeKind): string {
  switch (kind) {
    case 'extract':  return '#3a2a0a'
    case 'template': return '#1a2a10'
    case 'merge':    return '#0a2a2a'
    case 'script':   return '#2a0a3a'
    default:         return '#111114'
  }
}

function nodeTitle(node: WireNode): string {
  switch (node.kind) {
    case 'rpc':      return node.method?.fullPath ?? ''
    case 'extract':  return 'Extract'
    case 'template': return 'Template'
    case 'merge':    return 'Merge'
    case 'script':   return 'Script'
  }
}

// ─── Dragging nodes ───────────────────────────────────────────
interface DragState {
  nodeId: string
  startMouseX: number
  startMouseY: number
  startNodeX: number
  startNodeY: number
}

let dragState: DragState | null = null

interface ResizeState { nodeId: string; startMouseX: number; startW: number }
let resizeState: ResizeState | null = null

function startResize(e: MouseEvent, nodeId: string) {
  const node = nodes.value.find(n => n.id === nodeId)
  if (!node) return
  resizeState = { nodeId, startMouseX: e.clientX, startW: node.w }
  e.stopPropagation()
}

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
  routingPicker.value = null
  // Don't select (and expand) the node when a connection is in progress
  if (!pendingEdge.value) {
    selectedNodeId.value = nodeId
  }
}

function onMouseMove(e: MouseEvent) {
  if (resizeState) {
    const node = nodes.value.find(n => n.id === resizeState!.nodeId)
    if (node) {
      const dx = e.clientX - resizeState.startMouseX
      node.w = Math.max(160, snap(resizeState.startW + dx))
      layoutTick.value++
    }
    return
  }
  if (dragState) {
    const node = nodes.value.find(n => n.id === dragState!.nodeId)
    if (node) {
      const dx = e.clientX - dragState.startMouseX
      const dy = e.clientY - dragState.startMouseY
      node.pos.x = snap(dragState.startNodeX + dx)
      node.pos.y = snap(dragState.startNodeY + dy)
      layoutTick.value++
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
  resizeState = null
}

// ─── Drop from sidebar ────────────────────────────────────────
function onCanvasDragOver(e: DragEvent) {
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
}

function onCanvasDrop(e: DragEvent) {
  const raw = e.dataTransfer?.getData('application/x-plexus-method')
  if (!raw) return
  try {
    const data = JSON.parse(raw) as MethodEntry
    const rect = canvasWrap.value!.getBoundingClientRect()
    const x = snap(e.clientX - rect.left)
    const y = snap(e.clientY - rect.top)
    addNode(data, { x, y })
  } catch { /* ignore */ }
}

// ─── Port interaction ─────────────────────────────────────────
interface HoveredPort { nodeId: string; param: string }
interface PendingEdge { fromNodeId: string; fromX: number; fromY: number; toX: number; toY: number }

const hoveredPort = ref<HoveredPort | null>(null)
const pendingEdge = ref<PendingEdge | null>(null)
const hoveredEdge = ref<string | null>(null)

interface RoutingPicker { edgeId: string; x: number; y: number }
const routingPicker = ref<RoutingPicker | null>(null)

function outputPortPos(nodeId: string): { x: number; y: number } | null {
  void layoutTick.value  // reactive dependency — re-evaluates on node move/resize
  const node = nodes.value.find(n => n.id === nodeId)
  if (!node) return null
  const portEl = canvasWrap.value?.querySelector<HTMLElement>(`.wire-node[data-id="${nodeId}"] .port-out`)
  if (portEl) {
    const rect = portEl.getBoundingClientRect()
    const wrap = canvasWrap.value!.getBoundingClientRect()
    return { x: rect.left + rect.width / 2 - wrap.left, y: rect.top + rect.height / 2 - wrap.top }
  }
  return { x: node.pos.x + node.w + 6, y: node.pos.y + 40 }
}

function inputPortPos(nodeId: string, param: string): { x: number; y: number } | null {
  const node = nodes.value.find(n => n.id === nodeId)
  if (!node) return null
  const paramNames = getParamNames(node)
  const idx = paramNames.indexOf(param)
  if (idx < 0) return null
  const portEls = canvasWrap.value?.querySelectorAll<HTMLElement>(`.wire-node[data-id="${nodeId}"] .port-in`)
  if (portEls && portEls[idx]) {
    const rect = portEls[idx].getBoundingClientRect()
    const wrap = canvasWrap.value!.getBoundingClientRect()
    return { x: rect.left + rect.width / 2 - wrap.left, y: rect.top + rect.height / 2 - wrap.top }
  }
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
    id: makeEdgeId(), fromNodeId, toNodeId, toParam,
    routing: 'auto',
    routeConfig: { separator: '\n', predicate: '', reducer: '', initial: '' },
  })
  pendingEdge.value = null
}

function onCanvasClick() {
  pendingEdge.value = null
  selectedNodeId.value = null
  contextMenu.value = null
  routingPicker.value = null
}

// ─── Context menu ─────────────────────────────────────────────
interface ContextMenu { x: number; y: number; nodeId: string }
const contextMenu = ref<ContextMenu | null>(null)

function showContextMenu(e: MouseEvent, nodeId: string) {
  const wrap = canvasWrap.value?.getBoundingClientRect()
  const x = wrap ? e.clientX - wrap.left : e.clientX
  const y = wrap ? e.clientY - wrap.top  : e.clientY
  selectedNodeId.value = nodeId
  contextMenu.value = { x, y, nodeId }
}

function deleteNode(nodeId: string) {
  nodes.value = nodes.value.filter(n => n.id !== nodeId)
  edges.value = edges.value.filter(e => e.fromNodeId !== nodeId && e.toNodeId !== nodeId)
  if (selectedNodeId.value === nodeId) selectedNodeId.value = null
  contextMenu.value = null
}

function disconnectNode(nodeId: string) {
  edges.value = edges.value.filter(e => e.fromNodeId !== nodeId && e.toNodeId !== nodeId)
  contextMenu.value = null
}

// ─── Edge routing helpers ─────────────────────────────────────
function getEdge(edgeId: string): WireEdge | undefined {
  return edges.value.find(e => e.id === edgeId)
}

function openRoutingPicker(e: MouseEvent, edgeId: string): void {
  if (routingPicker.value?.edgeId === edgeId) { routingPicker.value = null; return }
  const wrap = canvasWrap.value?.getBoundingClientRect()
  if (!wrap) return
  routingPicker.value = { edgeId, x: e.clientX - wrap.left, y: e.clientY - wrap.top }
}

function setEdgeRouting(edgeId: string, mode: RouteMode): void {
  const edge = getEdge(edgeId)
  if (edge) edge.routing = mode
}

function setEdgeRouteConfig(edgeId: string, key: keyof RouteConfig, value: string): void {
  const edge = getEdge(edgeId)
  if (edge) edge.routeConfig[key] = value
}

function edgeMidpoint(edge: WireEdge): { x: number; y: number } | null {
  const from = outputPortPos(edge.fromNodeId)
  const to = inputPortPos(edge.toNodeId, edge.toParam)
  if (!from || !to) return null
  return { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }
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
  if (routingPicker.value?.edgeId === edgeId) routingPicker.value = null
}

// ─── Params ───────────────────────────────────────────────────
function getParamNames(node: WireNode): string[] {
  if (node.kind === 'extract' || node.kind === 'script') return ['input']
  if (node.kind === 'template' || node.kind === 'merge') return [...node.transform.inputNames]
  // rpc
  const params = node.method?.method.params
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

function availableRefIds(nodeId: string): string[] {
  return nodes.value.filter(n => n.id !== nodeId).map(n => n.id)
}

// ─── SchemaField + resolveRefs for RPC nodes ─────────────────
function toCamelCase(s: string): string {
  return s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
}

function resolveRefs(schema: JsonSchema & { $ref?: string }, defs: Record<string, JsonSchema>): JsonSchema {
  if (schema.$ref) {
    const name = schema.$ref.replace(/^#\/\$defs\//, '')
    const resolved = defs[name]
    return resolved ? resolveRefs(resolved, defs) : schema
  }
  const s = { ...schema }
  if (s.properties)
    s.properties = Object.fromEntries(
      Object.entries(s.properties).map(([k, v]) => [k, resolveRefs(v as JsonSchema & { $ref?: string }, defs)])
    )
  if (s.required) s.required = s.required.map(toCamelCase)
  if (s.items) s.items = resolveRefs(s.items as JsonSchema & { $ref?: string }, defs)
  if (s.anyOf) s.anyOf = s.anyOf.map(x => resolveRefs(x as JsonSchema & { $ref?: string }, defs))
  if (s.oneOf) s.oneOf = s.oneOf.map(x => resolveRefs(x as JsonSchema & { $ref?: string }, defs))
  return s
}

function resolvedParamSchema(node: WireNode): JsonSchema | null {
  if (node.kind !== 'rpc' || !node.method) return null
  const p = node.method.method.params
  if (!p || typeof p !== 'object') return null
  const raw = p as JsonSchema & { $defs?: Record<string, JsonSchema> }
  const defs = raw.$defs ?? {}
  const resolved = resolveRefs(raw, defs)
  if (resolved.type !== 'object' || !resolved.properties) return null
  return resolved
}

// ─── Template interpolation ───────────────────────────────────
function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce((a, k) => (a as Record<string, unknown>)?.[k], obj)
}

function resolveTemplateRefs(value: string, results: Map<string, unknown>): unknown {
  const m = value.match(/^\{(\w+)(?:\.(.+))?\}$/)
  if (m) return m[2] ? getPath(results.get(m[1] as string), m[2] as string) : results.get(m[1] as string)
  return value.replace(/\{(\w+)(?:\.([^}]+))?\}/g, (_, id: string, path: string) =>
    String(path ? getPath(results.get(id), path) : (results.get(id) ?? '')))
}

// ─── Transform node execution ─────────────────────────────────
function executeTransform(node: WireNode, inputs: Map<string, unknown>): unknown {
  switch (node.kind) {
    case 'extract':  return getPath(inputs.get('input'), node.transform.path)
    case 'template': return node.transform.template.replace(/\{\{(\w+)\}\}/g,
                       (_, k: string) => String(inputs.get(k) ?? ''))
    case 'merge':    return Object.assign({}, ...node.transform.inputNames
                       .map(n => (inputs.get(n) ?? {}) as object))
    case 'script':   return new Function('input',
                       `"use strict"; return (${node.transform.code || 'x => x'})(input)`
                     )(inputs.get('input'))
    default: return undefined
  }
}

// ─── Stream routing ───────────────────────────────────────────
function extractStringValue(item: unknown): string {
  if (typeof item === 'string') return item
  if (typeof item === 'object' && item !== null) {
    const obj = item as Record<string, unknown>
    const strField = ['line', 'value', 'text', 'result', 'output'].find(f => typeof obj[f] === 'string')
    if (strField) return obj[strField] as string
    return JSON.stringify(item)
  }
  return String(item ?? '')
}

function applyRouting(items: unknown[], edge: WireEdge): unknown {
  switch (edge.routing) {
    case 'each':    return items  // caller handles fan-out
    case 'collect': return items
    case 'last':    return items[items.length - 1]
    case 'first':   return items[0]
    case 'concat': {
      const sep = edge.routeConfig.separator !== '' ? edge.routeConfig.separator : '\n'
      return items.map(extractStringValue).join(sep)
    }
    case 'filter': {
      try {
        const pred = new Function('item', `"use strict"; return (${edge.routeConfig.predicate || 'x => true'})(item)`) as (x: unknown) => boolean
        return items.filter(pred)
      } catch { return items }
    }
    case 'reduce': {
      try {
        const fn = new Function('acc', 'item', `"use strict"; return (${edge.routeConfig.reducer || '(a,x) => x'})(acc, item)`) as (acc: unknown, item: unknown) => unknown
        const init = edge.routeConfig.initial ? JSON.parse(edge.routeConfig.initial) : undefined
        return init !== undefined ? items.reduce(fn, init) : items.reduce(fn)
      } catch { return undefined }
    }
    case 'auto': default:
      return items.length === 1 ? items[0] : items.length > 1 ? items : undefined
  }
}

async function executeNodeOnce(
  node: WireNode,
  inputs: Map<string, unknown>,
  nodeResults: Map<string, unknown>,
): Promise<unknown[]> {
  if (node.kind !== 'rpc') {
    return [executeTransform(node, inputs)]
  }
  const client = getClient(node.method!.backend)
  const paramSchema = resolvedParamSchema(node)
  const resolvedParams: Record<string, unknown> = { ...node.params }
  for (const [k, v] of inputs) {
    const expectedType = (paramSchema?.properties as Record<string, { type?: string }>)?.[k]?.type
    if (typeof v === 'object' && v !== null && expectedType === 'string') {
      const obj = v as Record<string, unknown>
      const strField = ['line', 'value', 'text', 'result', 'output'].find(f => typeof obj[f] === 'string')
      resolvedParams[k] = strField ? obj[strField] : JSON.stringify(v)
    } else {
      resolvedParams[k] = v
    }
  }
  for (const [k, v] of Object.entries(resolvedParams)) {
    if (typeof v === 'string') resolvedParams[k] = resolveTemplateRefs(v, nodeResults)
  }
  const finalParams: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(resolvedParams)) {
    if (typeof v === 'string') {
      try { finalParams[k] = JSON.parse(v) } catch { finalParams[k] = v }
    } else {
      finalParams[k] = v
    }
  }
  const items: unknown[] = []
  for await (const item of client.call(node.method!.fullPath, finalParams)) {
    if (item.type === 'data') items.push(item.content)
    else if (item.type === 'error') throw new Error(item.message)
  }
  return items
}

async function executeNodeWithRouting(
  node: WireNode,
  nodeEmissions: Map<string, unknown[]>,
  nodeResults: Map<string, unknown>,
): Promise<void> {
  const inEdges = edges.value.filter(e => e.toNodeId === node.id)
  const eachEdges = inEdges.filter(e => e.routing === 'each')
  const otherEdges = inEdges.filter(e => e.routing !== 'each')

  const scalarInputs = new Map<string, unknown>()
  for (const edge of otherEdges) {
    scalarInputs.set(edge.toParam, applyRouting(nodeEmissions.get(edge.fromNodeId) ?? [], edge))
  }

  let allEmissions: unknown[]
  if (eachEdges.length === 0) {
    allEmissions = await executeNodeOnce(node, scalarInputs, nodeResults)
  } else {
    // Zip each-routed streams; run node once per "row"
    const eachStreams = eachEdges.map(edge => ({
      param: edge.toParam,
      items: nodeEmissions.get(edge.fromNodeId) ?? [],
    }))
    const minLen = Math.min(...eachStreams.map(s => s.items.length))
    allEmissions = []
    for (let i = 0; i < minLen; i++) {
      const iterInputs = new Map(scalarInputs)
      for (const s of eachStreams) iterInputs.set(s.param, s.items[i])
      const emitted = await executeNodeOnce(node, iterInputs, nodeResults)
      allEmissions.push(...emitted)
    }
  }

  nodeEmissions.set(node.id, allEmissions)
  const collapsed = allEmissions.length === 1 ? allEmissions[0]
                  : allEmissions.length > 1  ? allEmissions
                  : undefined
  nodeResults.set(node.id, collapsed)
  node.result = collapsed
  node.status = 'done'
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
  const nodeEmissions = new Map<string, unknown[]>()  // all stream items per node
  const nodeResults = new Map<string, unknown>()       // collapsed, for template refs

  try {
    for (const node of sorted) {
      node.status = 'running'
      try {
        await executeNodeWithRouting(node, nodeEmissions, nodeResults)
      } catch (err) {
        node.status = 'error'
        node.result = err instanceof Error ? err.message : String(err)
        nodeEmissions.set(node.id, [])
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
      id: n.id, kind: n.kind, method: n.method?.fullPath, backend: n.method?.backend,
      pos: n.pos, params: n.params, transform: n.transform,
    })),
    edges: edges.value.map(e => ({ id: e.id, from: e.fromNodeId, to: e.toNodeId, toParam: e.toParam })),
  }
  const json = JSON.stringify(pipeline, null, 2)
  navigator.clipboard.writeText(json).catch(() => { alert(json) })
}

// ─── Misc helpers ─────────────────────────────────────────────
function formatSchema(schema: unknown): string {
  if (!schema || typeof schema !== 'object') return String(schema ?? '')
  return JSON.stringify(schema, null, 2)
}

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

.tb-run { border-color: #1f3a5f; color: #58a6ff; background: #0d1a2a; }
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

/* ── Breadcrumbs ─────────────────────────────────────────────── */
.sb-crumbs {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0;
  padding: 4px 8px;
  border-bottom: 1px solid #21262d;
  background: #0d0f14;
  flex-shrink: 0;
  min-height: 26px;
}

.sb-crumb {
  background: none;
  border: none;
  color: #58a6ff;
  font-family: inherit;
  font-size: 10px;
  padding: 1px 4px;
  border-radius: 3px;
  cursor: pointer;
  white-space: nowrap;
}
.sb-crumb:hover { background: #1a2840; }
.sb-crumb-home { color: #8b949e; font-size: 12px; padding: 0 4px; }
.sb-crumb-home:hover { color: #58a6ff; }

.sb-crumb-sep { color: #30363d; font-size: 11px; padding: 0 1px; }

/* ── Drill panel ─────────────────────────────────────────────── */
.sb-panel {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}

.sb-list { flex: 1; overflow-y: auto; }

.sb-empty { padding: 12px 10px; color: #484f58; font-size: 11px; }

/* ── Sidebar rows ────────────────────────────────────────────── */
.sb-row {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 7px 10px;
  border-bottom: 1px solid #14171b;
  cursor: pointer;
  user-select: none;
}
.sb-row:hover { background: #0f1318; }

.sb-row-backend { padding: 9px 10px; }
.sb-row-backend:hover { background: #111419; }

.sb-row-hub { }
.sb-row-method { cursor: grab; }
.sb-row-method:active { cursor: grabbing; }

.sb-row-icon {
  font-size: 11px;
  color: #484f58;
  flex-shrink: 0;
  width: 14px;
  text-align: center;
}
.sb-method-icon { color: #79c0ff; }

.sb-row-spinner {
  font-size: 11px;
  color: #484f58;
  width: 14px;
  text-align: center;
  animation: pulse 1.2s ease-in-out infinite;
}

.sb-row-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.sb-row-name {
  font-size: 11px;
  color: #c9d1d9;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sb-row-backend .sb-row-name { font-size: 12px; font-weight: 600; color: #58a6ff; }

.sb-row-desc {
  font-size: 10px;
  color: #484f58;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sb-row-backend-label { font-size: 9px; color: #30363d; }

.sb-row-meta {
  font-size: 10px;
  color: #30363d;
}

.sb-row-chevron {
  font-size: 12px;
  color: #30363d;
  flex-shrink: 0;
}
.sb-row:hover .sb-row-chevron { color: #58a6ff; }

.sb-row-tags {
  display: flex;
  gap: 3px;
  flex-shrink: 0;
}

.sb-row-backend-label { font-size: 9px; color: #30363d; }

/* ── Method tags ─────────────────────────────────────────────── */
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

/* ── Transforms section ──────────────────────────────────────── */
.transforms-section {
  border-top: 1px solid #21262d;
  padding: 8px 10px;
  flex-shrink: 0;
}

.transforms-header {
  font-size: 10px;
  color: #484f58;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 6px;
}

.transforms-row {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.transform-btn {
  background: #111114;
  border: 1px solid #30363d;
  color: #8b949e;
  font-family: inherit;
  font-size: 10px;
  padding: 3px 8px;
  border-radius: 3px;
  cursor: pointer;
}
.transform-btn:hover { border-color: #58a6ff; color: #58a6ff; background: #0d1a2a; }

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
  background: #111114;
  border: 1px solid #21262d;
  border-radius: 6px;
  padding: 8px 10px 8px 10px;
  cursor: grab;
  user-select: none;
  box-sizing: border-box;
  transition: border-color 0.15s, box-shadow 0.15s;
  overflow: visible;
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

.param-form-title {
  font-size: 10px;
  color: #484f58;
  margin-bottom: 4px;
  letter-spacing: 0.05em;
  display: flex;
  align-items: center;
  gap: 6px;
}

.param-hint { font-size: 9px; color: #3a5a3a; font-style: italic; }

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
.param-port-name { min-width: 80px; max-width: 120px; flex: 1; }

.port-del-btn {
  background: none;
  border: none;
  color: #484f58;
  cursor: pointer;
  font-size: 10px;
  padding: 1px 3px;
  flex-shrink: 0;
}
.port-del-btn:hover { color: #f85149; }

.add-port-btn {
  background: none;
  border: 1px solid #30363d;
  color: #484f58;
  font-family: inherit;
  font-size: 10px;
  padding: 2px 7px;
  border-radius: 3px;
  cursor: pointer;
  margin-top: 3px;
}
.add-port-btn:hover { border-color: #58a6ff; color: #58a6ff; }

.transform-textarea {
  width: 100%;
  background: #0a0c10;
  border: 1px solid #30363d;
  border-radius: 3px;
  color: #c9d1d9;
  font-family: inherit;
  font-size: 10px;
  padding: 3px 5px;
  resize: vertical;
  box-sizing: border-box;
  outline: none;
  line-height: 1.4;
}
.transform-textarea:focus { border-color: #58a6ff; }

.param-schema-field { margin-top: 2px; }

/* ── Returns section ─────────────────────────────────────────── */
.returns-section {
  margin-top: 8px;
  border-top: 1px solid #21262d;
  padding-top: 6px;
  cursor: default;
}

.returns-title { font-size: 10px; color: #484f58; margin-bottom: 3px; letter-spacing: 0.05em; }

.returns-schema {
  font-size: 9px;
  color: #a371f7;
  background: #100d1a;
  border: 1px solid #2d1f4e;
  border-radius: 3px;
  padding: 4px 6px;
  margin: 0;
  max-height: 80px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-all;
  font-family: inherit;
}

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

/* ── Context menu ────────────────────────────────────────────── */
.ctx-menu {
  position: absolute;
  z-index: 100;
  background: #1a1d23;
  border: 1px solid #30363d;
  border-radius: 5px;
  padding: 3px 0;
  min-width: 150px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.5);
}

.ctx-item {
  display: block;
  width: 100%;
  background: none;
  border: none;
  color: #c9d1d9;
  font-family: inherit;
  font-size: 11px;
  text-align: left;
  padding: 6px 14px;
  cursor: pointer;
}
.ctx-item:hover { background: #21262d; }
.ctx-item-danger { color: #f85149; }
.ctx-item-danger:hover { background: #2a1515; }

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

/* ── Resize handle ───────────────────────────────────────────── */
.resize-handle {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 14px;
  height: 14px;
  cursor: ew-resize;
  opacity: 0;
  transition: opacity 0.15s;
  /* diagonal grip lines */
  background-image:
    linear-gradient(135deg, transparent 40%, #484f58 40%, #484f58 50%, transparent 50%),
    linear-gradient(135deg, transparent 60%, #484f58 60%, #484f58 70%, transparent 70%);
}
.wire-node:hover .resize-handle { opacity: 1; }

@keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }

/* ── Edge routing badge ──────────────────────────────────────── */
.edge-badge-g { cursor: pointer; pointer-events: all; }

.edge-badge-bg {
  fill: #0d1014;
  stroke: #30363d;
  stroke-width: 1;
  transition: fill 0.1s, stroke 0.1s;
}
.edge-badge-g:hover .edge-badge-bg { fill: #21262d; stroke: #58a6ff; }

.edge-badge-bg.route-each    { fill: #0d1f0a; stroke: #2a5a20; }
.edge-badge-bg.route-collect { fill: #0a1520; stroke: #1a3a5a; }
.edge-badge-bg.route-last    { fill: #16101f; stroke: #4a3070; }
.edge-badge-bg.route-first   { fill: #16101f; stroke: #4a3070; }
.edge-badge-bg.route-concat  { fill: #1f1508; stroke: #6a4a10; }
.edge-badge-bg.route-filter  { fill: #08181f; stroke: #105a5a; }
.edge-badge-bg.route-reduce  { fill: #1f0a0a; stroke: #6a1515; }

.edge-badge-text {
  fill: #6e7681;
  font-size: 9px;
  font-family: 'Berkeley Mono', 'Fira Code', ui-monospace, monospace;
  pointer-events: none;
  user-select: none;
}
.edge-badge-g:hover .edge-badge-text { fill: #c9d1d9; }

/* ── Routing picker ──────────────────────────────────────────── */
.routing-picker {
  position: absolute;
  z-index: 200;
  background: #1a1d23;
  border: 1px solid #30363d;
  border-radius: 6px;
  padding: 7px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.6);
  min-width: 210px;
}

.routing-picker-modes {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 6px;
}

.route-mode-btn {
  background: #111114;
  border: 1px solid #30363d;
  color: #8b949e;
  font-family: inherit;
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 3px;
  cursor: pointer;
}
.route-mode-btn:hover { border-color: #58a6ff; color: #58a6ff; }
.route-mode-btn.active { border-color: #3fb950; color: #3fb950; background: #0a1f0a; }

.routing-config-input {
  display: block;
  width: 100%;
  background: #0a0c10;
  border: 1px solid #30363d;
  border-radius: 3px;
  color: #c9d1d9;
  font-family: inherit;
  font-size: 10px;
  padding: 3px 6px;
  box-sizing: border-box;
  outline: none;
  margin-bottom: 4px;
}
.routing-config-input:focus { border-color: #58a6ff; }
.routing-config-input::placeholder { color: #484f58; }

.routing-del-btn {
  display: block;
  width: 100%;
  background: none;
  border: 1px solid #3a1515;
  color: #f85149;
  font-family: inherit;
  font-size: 10px;
  padding: 3px 8px;
  border-radius: 3px;
  cursor: pointer;
  margin-top: 2px;
  text-align: center;
}
.routing-del-btn:hover { background: #2a1010; }
</style>
