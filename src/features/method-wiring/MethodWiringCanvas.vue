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
      <button class="tb-btn" @click="autoLayout" title="Auto-arrange nodes">[Auto Layout]</button>
      <button class="tb-btn" @click="resetView" title="Reset pan/zoom">[Reset View]</button>
      <button class="tb-btn" @click="triggerImport" title="Import pipeline JSON">[Import]</button>
      <button class="tb-btn" @click="copySnapshot" title="Copy run snapshot to clipboard">[Snapshot]</button>
      <button class="tb-btn" :class="{ 'tb-active': previewMode }" @click="previewMode = !previewMode" title="Toggle UI preview (P)">[Preview]</button>
      <input type="file" ref="importFileInput" accept=".json" style="display:none" @change="onImportFile" />
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

          <!-- UI nodes section -->
          <div class="transforms-section">
            <div class="transforms-header">UI</div>
            <div class="transforms-row">
              <button class="transform-btn ui-btn-vars" @click="addUiNode('vars')" title="Reactive key-value store">Vars</button>
              <button class="transform-btn ui-btn-layout" @click="addUiNode('layout', undefined, 'row')" title="Horizontal flex container">Row</button>
              <button class="transform-btn ui-btn-layout" @click="addUiNode('layout', undefined, 'col')" title="Vertical flex container">Col</button>
            </div>
            <div class="transforms-row">
              <button class="transform-btn ui-btn-widget" @click="addUiNode('widget', 'text')" title="Display text or value">Text</button>
              <button class="transform-btn ui-btn-widget" @click="addUiNode('widget', 'input')" title="Text input field">Input</button>
              <button class="transform-btn ui-btn-widget" @click="addUiNode('widget', 'button')" title="Clickable button">Btn</button>
              <button class="transform-btn ui-btn-widget" @click="addUiNode('widget', 'slider')" title="Range slider">Slider</button>
              <button class="transform-btn ui-btn-widget" @click="addUiNode('widget', 'table')" title="Data table">Table</button>
            </div>
          </div>
        </template>
      </aside>

      <!-- Right canvas -->
      <CanvasLayer
        class="canvas-wrap"
        :class="{ panning: isPanning }"
        ref="canvasLayerRef"
        :transform="transformStyle"
        @click="onCanvasClick"
        @contextmenu.prevent="onCanvasClick"
        @mousedown="onCanvasMouseDown"
        @mousemove="onMouseMove"
        @mouseup="onMouseUp"
        @wheel.prevent="onCanvasWheel"
        @keydown="handleKeyDown"
        @keyup="onKeyUp"
        @touchstart.prevent="onCanvasTouchStart"
        @touchmove.prevent="onCanvasTouchMove"
        @touchend="onCanvasTouchEnd"
        @dragover.prevent="onCanvasDragOver"
        @drop="onCanvasDrop"
        tabindex="0"
      >
        <template #content>
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
            @mousedown.capture="onNodeCaptureMousedown(node.id)"
            @mousedown.stop="startDrag($event, node.id)"
            @click.stop
            @contextmenu.prevent.stop="showContextMenu($event, node.id)"
          >
            <!-- Status dot -->
            <span class="status-dot" :class="`status-dot-${node.status}`"></span>

            <!-- Node title + subtitle -->
            <div class="node-title">{{ nodeTitle(node) }}</div>
            <div v-if="nodeSubtitle(node)" class="node-subtitle">{{ nodeSubtitle(node) }}</div>

            <!-- Input ports (params) on the left -->
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

            <!-- Output port on the right -->
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

            <!-- Result preview when done -->
            <div v-if="node.status === 'done' && node.result !== undefined" class="node-result" @mousedown.stop @click.stop>
              <span class="result-label">result:</span>
              <span class="result-value">{{ resultPreview(node.result) }}</span>
              <button class="result-copy-btn" @click.stop="copyNodeResult(node)" title="Copy">⎘</button>
            </div>
            <div v-if="node.status === 'error' && node.result !== undefined" class="node-result node-result-error" @mousedown.stop @click.stop>
              <span class="result-label">error:</span>
              <span class="result-value">{{ String(node.result) }}</span>
              <button class="result-copy-btn" @click.stop="copyNodeResult(node)" title="Copy">⎘</button>
            </div>

            <!-- Resize handle (bottom-right corner) -->
            <div class="resize-handle" @mousedown.stop="startResize($event, node.id)" title="Drag to resize"></div>
          </div>

          <!-- Empty state -->
          <div v-if="nodes.length === 0" class="canvas-empty">
            Drag a method from the sidebar, or click one to add it
          </div>
        </template>

        <template #overlay>
        <!-- Context menu (in canvas-wrap space, not transformed) -->
        <div
          v-if="contextMenu"
          class="ctx-menu"
          :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
          @mousedown.stop
          @click.stop
        >
          <button class="ctx-item" @click="rerunNode(contextMenu!.nodeId, false); contextMenu = null">Rerun node</button>
          <button class="ctx-item" @click="rerunNode(contextMenu!.nodeId, true); contextMenu = null">Rerun + downstream</button>
          <div class="ctx-sep"></div>
          <button class="ctx-item ctx-item-danger" @click="deleteNode(contextMenu!.nodeId)">Delete node</button>
          <button class="ctx-item" @click="disconnectNode(contextMenu!.nodeId)">Disconnect edges</button>
          <button class="ctx-item" @click="contextMenu = null">Cancel</button>
        </div>

        <!-- Routing picker (in canvas-wrap space, not transformed) -->
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
          <template v-if="routingPickerTypeVariants.length">
            <div class="routing-section-title">filter types</div>
            <div class="routing-type-filters">
              <label v-for="t in routingPickerTypeVariants" :key="t" class="routing-type-label">
                <input
                  type="checkbox"
                  :checked="getEdge(routingPicker!.edgeId)!.routeConfig.typeFilter.includes(t)"
                  @change="toggleTypeFilter(routingPicker!.edgeId, t)"
                />
                {{ t }}
              </label>
            </div>
          </template>
          <button class="routing-del-btn" @click="removeEdge(routingPicker.edgeId)">delete edge</button>
        </div>

        <!-- Floating param panel (in canvas-wrap space, not transformed) -->
        <WiringParamPanel
          :node="selectedNode"
          :anchor-x="selectedNodeAnchorX"
          :anchor-y="selectedNodeAnchorY"
          :anchor-w="selectedNodeAnchorW"
          :connected-params="selectedNodeConnectedParams"
          :available-refs="selectedNodeRefs"
          :resolved-schema="selectedNodeSchema"
          :mode="panelMode"
          @update:mode="panelMode = $event"
          @close="selectedNodeId = null"
          @update:params="onParamPanelUpdateParams"
          @update:transform="onParamPanelUpdateTransform"
          @update:ui="onParamPanelUpdateUi"
          @add-port="onParamPanelAddPort"
          @remove-port="onParamPanelRemovePort"
        />

        <!-- UI Preview overlay -->
        <WiringUIPreview
          :open="previewMode"
          :nodes="nodes"
          :edges="edges"
          @close="previewMode = false"
          @param-update="onPreviewParamUpdate"
          @trigger="onPreviewTrigger"
          @run="runAll()"
        />

        <!-- Mini-map (in canvas-wrap space, not transformed) -->
        <WiringMiniMap
          :nodes="nodes"
          :edges="edges"
          :pan="pan"
          :zoom="zoom"
          :viewport-w="svgW"
          :viewport-h="svgH"
          @pan-to="onMiniMapPanTo"
        />
        </template>
      </CanvasLayer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import type { MethodEntry } from '../../components/CommandPalette.vue'
import { useContainedFocus } from '../../lib/useContainedFocus'
import { getSharedClient } from '../../lib/plexus/clientRegistry'
import { getCachedTree } from '../../lib/plexus/schemaCache'
import { flattenTree } from '../../schema-walker'
import type { PluginNode, MethodSchema } from '../../plexus-schema'
import type { JsonSchema } from '../../components/SchemaField.vue'
import CanvasLayer from '../../components/CanvasLayer.vue'
import WiringParamPanel from './WiringParamPanel.vue'
import WiringMiniMap from './WiringMiniMap.vue'
import { useCanvasPanZoom } from './useCanvasPanZoom'
import type { PanelMode } from '../../components/FloatPanel.vue'
import { useNodeLayout } from './useNodeLayout'
import { useWiringPersist } from './useWiringPersist'
import type { WireNode, WireEdge, NodeKind, RouteMode, WidgetKind, LayoutDir, NodeUi } from './wiringTypes'
import { DEFAULT_UI } from './wiringTypes'
import WiringUIPreview from './WiringUIPreview.vue'

const { focus } = useContainedFocus()

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
  nextTick(() => focus(sidebarInput.value))
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
const panelMode = ref<PanelMode>('float')
const running = ref(false)
const previewMode = ref(false)
// Bump to force edge SVG re-render after node resize (DOM positions change non-reactively)
const layoutTick = ref(0)
const runError = ref<string | null>(null)

// ─── Composables ──────────────────────────────────────────────
const {
  pan, zoom, isPanning, transformStyle,
  onWheel: panZoomWheel, beginPan, onPanMove, onPanEnd,
  onKeyDown, onKeyUp,
  onTouchStart: panZoomTouchStart, onTouchMove: panZoomTouchMove, onTouchEnd: panZoomTouchEnd,
  screenToCanvas, panTo, reset: resetView,
} = useCanvasPanZoom()

const { autoLayout } = useNodeLayout(nodes, edges, layoutTick)
const { load: loadPipeline, exportJson, importJson } = useWiringPersist(nodes, edges, {
  selectedNodeId, panelMode, pan, zoom,
})

// ─── SVG dimensions (ResizeObserver) ─────────────────────────
const canvasLayerRef = ref<{ el: HTMLElement | null } | null>(null)
const canvasWrap = computed(() => canvasLayerRef.value?.el ?? null)
const svgW = ref(800)
const svgH = ref(600)

let resizeObserver: ResizeObserver | null = null

// Re-load trees whenever new backends are discovered (port scan runs after mount)
watch(() => props.connections, loadSidebarTrees, { deep: true })

// After each pan/zoom DOM update, re-render edges so getBoundingClientRect reads fresh positions
watch(transformStyle, () => { layoutTick.value++ }, { flush: 'post' })

// Re-render edges after DOM updates when node status/result changes (result preview adds height)
watch(
  () => nodes.value.map(n => `${n.id}:${n.status}:${n.result !== undefined}`),
  () => { layoutTick.value++ },
  { flush: 'post' },
)

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
  loadPipeline()
  // Re-render edges after DOM is ready (nodes may not exist in DOM on first render)
  nextTick(() => { layoutTick.value++ })
  // Advance counters past any restored IDs to avoid collisions
  for (const n of nodes.value) {
    const num = parseInt(n.id.replace(/^n/, ''))
    if (!isNaN(num) && num >= nodeCounter) nodeCounter = num + 1
  }
  for (const e of edges.value) {
    const num = parseInt(e.id.replace(/^e/, ''))
    if (!isNaN(num) && num >= edgeCounter) edgeCounter = num + 1
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
    ui: { ...DEFAULT_UI },
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
      inputNames: kind === 'template' || kind === 'merge' || kind === 'layout' ? ['slot0'] : [],
    },
    ui: { ...DEFAULT_UI },
    pos: { x: baseX, y: baseY },
    w: 220,
    params: {},
    status: 'idle',
    result: undefined,
  }
  nodes.value.push(node)
  selectedNodeId.value = node.id
}

function addUiNode(kind: 'vars' | 'widget' | 'layout', widgetKind?: WidgetKind, dir?: LayoutDir) {
  const baseX = snap(60 + (nodes.value.length % 4) * 240)
  const baseY = snap(60 + Math.floor(nodes.value.length / 4) * 180)
  const ui: NodeUi = {
    ...DEFAULT_UI,
    ...(kind === 'widget' && widgetKind ? { widgetKind } : {}),
    ...(kind === 'layout' && dir ? { dir } : {}),
  }
  const node: WireNode = {
    id: makeNodeId(),
    kind,
    method: undefined,
    transform: {
      path: '',
      template: '',
      code: '',
      inputNames: kind === 'layout' ? ['slot0'] : [],
    },
    ui,
    pos: { x: baseX, y: baseY },
    w: kind === 'vars' ? 180 : kind === 'widget' && widgetKind === 'table' ? 280 : 180,
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
    case 'vars':     return '#1a0a2a'
    case 'widget':   return '#0a1a2a'
    case 'layout':   return '#0a1520'
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
    case 'vars':     return node.ui.storeName || 'vars'
    case 'widget':   return node.ui.widgetKind
    case 'layout':   return `layout:${node.ui.dir}`
  }
}

function nodeSubtitle(node: WireNode): string {
  if (node.kind === 'rpc') {
    const first = Object.values(node.params).find(v => v !== '' && v !== null && v !== undefined)
    return first !== undefined ? String(first) : ''
  }
  if (node.kind === 'extract') return node.transform.path || ''
  if (node.kind === 'template') return node.transform.template.slice(0, 40) || ''
  if (node.kind === 'script') return node.transform.code.slice(0, 40) || ''
  if (node.kind === 'vars') {
    const keys = Object.keys(node.ui.store)
    return keys.length ? keys.join(', ') : 'empty'
  }
  if (node.kind === 'widget') return node.ui.label || ''
  if (node.kind === 'layout') {
    const slotCount = node.transform.inputNames.length
    return slotCount ? `${slotCount} slot${slotCount !== 1 ? 's' : ''}` : 'no slots'
  }
  return ''
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
  if (!pendingEdge.value) {
    selectedNodeId.value = nodeId
  }
}

// ─── Canvas mouse handlers ────────────────────────────────────
function onCanvasMouseDown(e: MouseEvent) {
  beginPan(e)
}

function onCanvasTouchStart(e: TouchEvent) {
  const rect = canvasWrap.value?.getBoundingClientRect()
  if (rect) panZoomTouchStart(e, rect)
}

function onCanvasTouchMove(e: TouchEvent) {
  const rect = canvasWrap.value?.getBoundingClientRect()
  if (rect) panZoomTouchMove(e, rect)
}

function onCanvasTouchEnd(e: TouchEvent) {
  panZoomTouchEnd(e)
}

function onCanvasWheel(e: WheelEvent) {
  const rect = canvasWrap.value?.getBoundingClientRect()
  if (rect) panZoomWheel(e, rect)
}

function handleKeyDown(e: KeyboardEvent) {
  onKeyDown(e)
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault()
    runPipeline()
  }
  // P to toggle preview (only when not typing in an input)
  if (e.key === 'p' && e.target === e.currentTarget) {
    e.preventDefault()
    previewMode.value = !previewMode.value
  }
}

function onNodeCaptureMousedown(nodeId: string) {
  if (!pendingEdge.value) selectedNodeId.value = nodeId
}

function onMouseMove(e: MouseEvent) {
  if (onPanMove(e)) return
  if (resizeState) {
    const node = nodes.value.find(n => n.id === resizeState!.nodeId)
    if (node) {
      const dx = e.clientX - resizeState.startMouseX
      node.w = Math.max(160, snap(resizeState.startW + dx / zoom.value))
      layoutTick.value++
    }
    return
  }
  if (dragState) {
    const screenDx = e.clientX - dragState.startMouseX
    const screenDy = e.clientY - dragState.startMouseY
    if (Math.hypot(screenDx, screenDy) < 5) return
    const node = nodes.value.find(n => n.id === dragState!.nodeId)
    if (node) {
      node.pos.x = snap(dragState.startNodeX + screenDx / zoom.value)
      node.pos.y = snap(dragState.startNodeY + screenDy / zoom.value)
      layoutTick.value++
    }
  }
  if (pendingEdge.value) {
    const rect = canvasWrap.value?.getBoundingClientRect()
    if (rect) {
      const { x, y } = screenToCanvas(e.clientX, e.clientY, rect)
      pendingEdge.value.toX = x
      pendingEdge.value.toY = y
    }
  }
}

function onMouseUp() {
  onPanEnd()
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
    const { x, y } = screenToCanvas(e.clientX, e.clientY, rect)
    addNode(data, { x: snap(x), y: snap(y) })
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

// Returns canvas-space position of a node's output port
function outputPortPos(nodeId: string): { x: number; y: number } | null {
  void layoutTick.value  // reactive dependency
  const node = nodes.value.find(n => n.id === nodeId)
  if (!node) return null
  const portEl = canvasWrap.value?.querySelector<HTMLElement>(`.wire-node[data-id="${nodeId}"] .port-out`)
  if (portEl) {
    const rect = portEl.getBoundingClientRect()
    const wrap = canvasWrap.value!.getBoundingClientRect()
    return {
      x: (rect.left + rect.width / 2 - wrap.left - pan.value.x) / zoom.value,
      y: (rect.top + rect.height / 2 - wrap.top - pan.value.y) / zoom.value,
    }
  }
  return { x: node.pos.x + node.w + 6, y: node.pos.y + 40 }
}

// Returns canvas-space position of a node's input port
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
    return {
      x: (rect.left + rect.width / 2 - wrap.left - pan.value.x) / zoom.value,
      y: (rect.top + rect.height / 2 - wrap.top - pan.value.y) / zoom.value,
    }
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
    routeConfig: { separator: '\n', predicate: '', reducer: '', initial: '', typeFilter: [] },
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

function setEdgeRouteConfig(edgeId: string, key: 'separator' | 'predicate' | 'reducer' | 'initial', value: string): void {
  const edge = getEdge(edgeId)
  if (edge) edge.routeConfig[key] = value
}

function toggleTypeFilter(edgeId: string, type: string): void {
  const edge = getEdge(edgeId)
  if (!edge) return
  const cur = edge.routeConfig.typeFilter
  edge.routeConfig.typeFilter = cur.includes(type) ? cur.filter(t => t !== type) : [...cur, type]
}

function extractTypeVariants(schema: unknown): string[] {
  if (!schema || typeof schema !== 'object') return []
  const s = schema as Record<string, unknown>
  const branches = (s.anyOf ?? s.oneOf) as unknown[] | undefined
  if (!Array.isArray(branches)) return []
  return branches.flatMap(b => {
    if (typeof b !== 'object' || b === null) return []
    const props = (b as Record<string, unknown>).properties as Record<string, unknown> | undefined
    const tf = props?.type as Record<string, unknown> | undefined
    if (typeof tf?.const === 'string') return [tf.const]
    if (Array.isArray(tf?.enum)) return (tf.enum as unknown[]).filter((e): e is string => typeof e === 'string')
    return []
  })
}

const routingPickerTypeVariants = computed<string[]>(() => {
  if (!routingPicker.value) return []
  const edge = getEdge(routingPicker.value.edgeId)
  if (!edge) return []
  const fromNode = nodes.value.find(n => n.id === edge.fromNodeId)
  return extractTypeVariants(fromNode?.method?.method.returns)
})

function edgeMidpoint(edge: WireEdge): { x: number; y: number } | null {
  const from = outputPortPos(edge.fromNodeId)
  const to = inputPortPos(edge.toNodeId, edge.toParam)
  if (!from || !to) return null
  return { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }
}

// ─── Edge paths (bezier, in canvas space) ────────────────────
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
  if (node.kind === 'vars') return []
  if (node.kind === 'layout') return [...node.transform.inputNames]
  if (node.kind === 'widget') {
    switch (node.ui.widgetKind) {
      case 'text':   return ['value']
      case 'input':  return ['value']
      case 'button': return ['label']
      case 'slider': return ['value', 'min', 'max']
      case 'table':  return ['data']
    }
  }
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

// ─── Param panel state ────────────────────────────────────────
const selectedNode = computed(() => nodes.value.find(n => n.id === selectedNodeId.value) ?? null)

const selectedNodeConnectedParams = computed(() =>
  edges.value.filter(e => e.toNodeId === selectedNodeId.value).map(e => e.toParam)
)

const selectedNodeRefs = computed(() =>
  nodes.value.filter(n => n.id !== selectedNodeId.value).map(n => n.id)
)

const selectedNodeSchema = computed(() =>
  selectedNode.value ? resolvedParamSchema(selectedNode.value) : null
)

// Canvas-space → screen-relative-to-wrap (for panel anchor positioning)
const selectedNodeAnchorX = computed(() =>
  selectedNode.value ? selectedNode.value.pos.x * zoom.value + pan.value.x : 0
)
const selectedNodeAnchorY = computed(() =>
  selectedNode.value ? selectedNode.value.pos.y * zoom.value + pan.value.y : 0
)
const selectedNodeAnchorW = computed(() =>
  selectedNode.value ? selectedNode.value.w * zoom.value : 0
)

function onParamPanelUpdateParams(params: Record<string, unknown>) {
  const node = selectedNode.value
  if (node) node.params = params
}

function onParamPanelUpdateUi(patch: Partial<NodeUi>) {
  const node = selectedNode.value
  if (node) Object.assign(node.ui, patch)
}

// ─── Preview run helpers ──────────────────────────────────────
function runAll() {
  const toIds = new Set(edges.value.map(e => e.toNodeId))
  nodes.value
    .filter(n => !toIds.has(n.id))
    .forEach(n => rerunNode(n.id, true))
}

let previewRunTimer: ReturnType<typeof setTimeout> | null = null
function schedulePreviewRun(nodeId: string) {
  if (previewRunTimer !== null) clearTimeout(previewRunTimer)
  previewRunTimer = setTimeout(() => rerunNode(nodeId, true), 300)
}

function onPreviewParamUpdate({ nodeId, key, value }: { nodeId: string; key: string; value: unknown }) {
  const node = nodes.value.find(n => n.id === nodeId)
  if (!node) return
  node.params[key] = value

  // Write-back to bound vars store
  if (node.ui.binding) {
    const dotIdx = node.ui.binding.indexOf('.')
    const boundNodeId = node.ui.binding.slice(0, dotIdx)
    const boundKey = node.ui.binding.slice(dotIdx + 1)
    const varsNode = nodes.value.find(n => n.id === boundNodeId && n.kind === 'vars')
    if (varsNode) varsNode.ui.store[boundKey] = value
  }

  // Auto-run (debounced for sliders)
  if (node.ui.autoRun) {
    const runTargetId = node.ui.binding
      ? node.ui.binding.slice(0, node.ui.binding.indexOf('.'))
      : nodeId
    schedulePreviewRun(runTargetId)
  }
}

function onPreviewTrigger(nodeId: string) {
  const node = nodes.value.find(n => n.id === nodeId)
  if (node?.ui.runMode === 'full') runAll()
  else rerunNode(nodeId, true)
}

function onParamPanelUpdateTransform(patch: { path?: string; template?: string; code?: string; inputNames?: string[] }) {
  const node = selectedNode.value
  if (!node) return
  if (patch.path !== undefined) node.transform.path = patch.path
  if (patch.template !== undefined) node.transform.template = patch.template
  if (patch.code !== undefined) node.transform.code = patch.code
  if (patch.inputNames !== undefined) node.transform.inputNames = patch.inputNames
}

function onParamPanelAddPort() {
  const node = selectedNode.value
  if (!node) return
  const prefix = node.kind === 'merge' ? 'field' : 'port'
  node.transform.inputNames.push(prefix + node.transform.inputNames.length)
}

function onParamPanelRemovePort(index: number) {
  const node = selectedNode.value
  if (!node) return
  node.transform.inputNames.splice(index, 1)
}

// ─── MiniMap ──────────────────────────────────────────────────
function onMiniMapPanTo(coords: { x: number; y: number }) {
  const rect = canvasWrap.value?.getBoundingClientRect()
  if (rect) panTo(coords.x, coords.y, rect)
}

// ─── Import / Export ──────────────────────────────────────────
const importFileInput = ref<HTMLInputElement | null>(null)

function triggerImport() {
  importFileInput.value?.click()
}

function onImportFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (ev) => {
    const s = ev.target?.result as string
    if (!importJson(s)) alert('Invalid pipeline JSON')
    ;(e.target as HTMLInputElement).value = ''
  }
  reader.readAsText(file)
}

// ─── Type filter ──────────────────────────────────────────────
function filterByType(items: unknown[], typeFilter: string[]): unknown[] {
  if (typeFilter.length === 0) return items
  return items.filter(item => {
    if (typeof item !== 'object' || item === null) return true
    const t = (item as Record<string, unknown>).type
    return typeof t === 'string' && typeFilter.includes(t)
  })
}

// ─── Template interpolation ───────────────────────────────────
function getPath(obj: unknown, path: string): unknown {
  // normalise bracket notation: [0] or ['key'] → .0 / .key
  const keys = path.replace(/\[(\d+)\]/g, '.$1').replace(/\[['"]([^'"]+)['"]\]/g, '.$1').split('.').filter(Boolean)
  return keys.reduce((a, k) => (a as Record<string, unknown>)?.[k], obj)
}

function resolveTemplateRefs(value: string, results: Map<string, unknown>): unknown {
  // Match {nodeId} or {nodeId.path} or {nodeId[0].field} etc.
  const m = value.match(/^\{(\w+)([^}]*)\}$/)
  if (m) {
    const base = results.get(m[1]!)
    return m[2] ? getPath(base, m[2].replace(/^\./, '')) : base
  }
  return value.replace(/\{(\w+)([^}]*)\}/g, (_, id: string, rest: string) => {
    const base = results.get(id)
    return String(rest ? getPath(base, rest.replace(/^\./, '')) : (base ?? ''))
  })
}

// ─── Transform node execution ─────────────────────────────────
function executeTransform(node: WireNode, inputs: Map<string, unknown>): unknown {
  switch (node.kind) {
    case 'vars':    return { ...node.ui.store }
    case 'widget': {
      switch (node.ui.widgetKind) {
        case 'table':  return inputs.get('data')
        case 'input':  return inputs.get('value') ?? node.params.value ?? ''
        case 'slider': return inputs.get('value') ?? node.params.value ?? node.params.min ?? 0
        case 'button': return { clicked: true, ts: Date.now() }
        default:       return inputs.get('value')
      }
    }
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
    case 'each':    return items
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
    // Only flow wired value in if param is not already configured by the user
    const configured = node.params[k]
    if (configured !== undefined && configured !== null && configured !== '') continue
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
  if (node.kind === 'layout') return  // layout is structural only
  const inEdges = edges.value.filter(e => e.toNodeId === node.id)
  const eachEdges = inEdges.filter(e => e.routing === 'each')
  const otherEdges = inEdges.filter(e => e.routing !== 'each')

  const scalarInputs = new Map<string, unknown>()
  for (const edge of otherEdges) {
    const items = filterByType(nodeEmissions.get(edge.fromNodeId) ?? [], edge.routeConfig.typeFilter)
    scalarInputs.set(edge.toParam, applyRouting(items, edge))
  }

  let allEmissions: unknown[]
  if (eachEdges.length === 0) {
    allEmissions = await executeNodeOnce(node, scalarInputs, nodeResults)
  } else {
    const eachStreams = eachEdges.map(edge => ({
      param: edge.toParam,
      fromNodeId: edge.fromNodeId,
      items: filterByType(nodeEmissions.get(edge.fromNodeId) ?? [], edge.routeConfig.typeFilter),
    }))
    const minLen = Math.min(...eachStreams.map(s => s.items.length))
    allEmissions = []
    for (let i = 0; i < minLen; i++) {
      const iterInputs = new Map(scalarInputs)
      const iterResults = new Map(nodeResults)
      for (const s of eachStreams) {
        iterInputs.set(s.param, s.items[i])
        iterResults.set(s.fromNodeId, s.items[i])
      }
      const emitted = await executeNodeOnce(node, iterInputs, iterResults)
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
// Persisted emissions map — rebuilt after each run, used for selective re-runs
const persistedEmissions = ref(new Map<string, unknown[]>())

async function runPipeline() {
  if (running.value || nodes.value.length === 0) return
  running.value = true
  runError.value = null

  for (const node of nodes.value) {
    node.status = 'idle'
    node.result = undefined
  }

  const sorted = topoSort(nodes.value, edges.value)
  const nodeEmissions = new Map<string, unknown[]>()
  const nodeResults = new Map<string, unknown>()

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
    persistedEmissions.value = new Map(nodeEmissions)
  }
}

// ─── Selective re-run ─────────────────────────────────────────
function getDownstreamNodes(startId: string): WireNode[] {
  const visited = new Set<string>()
  const queue = [startId]
  while (queue.length) {
    const id = queue.shift()!
    if (visited.has(id)) continue
    visited.add(id)
    for (const e of edges.value) {
      if (e.fromNodeId === id && !visited.has(e.toNodeId)) queue.push(e.toNodeId)
    }
  }
  visited.delete(startId)
  return topoSort(nodes.value.filter(n => visited.has(n.id)), edges.value)
}

async function rerunNode(nodeId: string, includeDownstream: boolean) {
  if (running.value) return
  const node = nodes.value.find(n => n.id === nodeId)
  if (!node) return
  running.value = true

  // Build fresh maps from persisted results of other nodes
  const nodeEmissions = new Map<string, unknown[]>(persistedEmissions.value)
  const nodeResults = new Map<string, unknown>()
  for (const [id, emissions] of persistedEmissions.value) {
    const collapsed = emissions.length === 1 ? emissions[0] : emissions.length > 1 ? emissions : undefined
    nodeResults.set(id, collapsed)
  }

  const nodesToRun = [node, ...(includeDownstream ? getDownstreamNodes(nodeId) : [])]

  try {
    for (const n of nodesToRun) {
      n.status = 'running'
      try {
        await executeNodeWithRouting(n, nodeEmissions, nodeResults)
      } catch (err) {
        n.status = 'error'
        n.result = err instanceof Error ? err.message : String(err)
        nodeEmissions.set(n.id, [])
      }
    }
  } finally {
    running.value = false
    // Merge updated emissions back
    for (const n of nodesToRun) {
      const em = nodeEmissions.get(n.id)
      if (em) persistedEmissions.value.set(n.id, em)
    }
  }
}

// ─── Snapshot / copy ──────────────────────────────────────────
function copyNodeResult(node: WireNode) {
  const text = node.result === undefined || node.result === null ? ''
    : typeof node.result === 'string' ? node.result
    : JSON.stringify(node.result, null, 2)
  navigator.clipboard.writeText(text).catch(() => { alert(text) })
}

function copySnapshot() {
  const snapshot = {
    timestamp: new Date().toISOString(),
    nodes: nodes.value.map(n => ({
      id: n.id,
      kind: n.kind,
      label: n.method?.fullPath ?? n.kind,
      params: Object.keys(n.params).length ? n.params : undefined,
      transform: n.kind !== 'rpc' ? n.transform : undefined,
      status: n.status,
      result: n.result,
    })),
    edges: edges.value.map(e => ({
      id: e.id,
      fromNodeId: e.fromNodeId,
      toNodeId: e.toNodeId,
      toParam: e.toParam,
      routing: e.routing,
      routeConfig: e.routeConfig,
    })),
  }
  const text = JSON.stringify(snapshot, null, 2)
  navigator.clipboard.writeText(text).catch(() => { alert(text) })
}

// ─── Toolbar actions ──────────────────────────────────────────
function clearCanvas() {
  nodes.value = []
  edges.value = []
  selectedNodeId.value = null
  pendingEdge.value = null
  runError.value = null
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

.tb-run { border-color: #1f3a5f; color: #58a6ff; background: #0d1a2a; }
.tb-run:not(:disabled):hover { background: #1a2840; }
.tb-active { border-color: #a371f7 !important; color: #a371f7 !important; background: #1a0a2a; }

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

.ui-btn-vars   { border-color: #3d1a5f44; color: #a371f7; }
.ui-btn-vars:hover   { border-color: #a371f7; background: #1a0a2a; }
.ui-btn-layout { border-color: #1a3a5f44; color: #58a6ff; }
.ui-btn-layout:hover { border-color: #58a6ff; background: #0a1a2a; }
.ui-btn-widget { border-color: #1a3a2a44; color: #3fb950; }
.ui-btn-widget:hover { border-color: #3fb950; background: #0a1a0a; }

/* ── Canvas ──────────────────────────────────────────────────── */
.canvas-wrap {
  flex: 1;
  position: relative;
  background-color: #080a0e;
  background-image: radial-gradient(circle, #1e2530 1px, transparent 1px);
  background-size: 20px 20px;
  cursor: default;
  min-width: 0;
}

.canvas-wrap.panning { cursor: grabbing !important; }

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
.node-subtitle {
  font-size: 10px;
  color: #58a6ff;
  opacity: 0.8;
  word-break: break-all;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
  margin-top: 1px;
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
  user-select: text;
  cursor: text;
}
.node-result-error .result-value { color: #f85149; }

/* ── Context menu ────────────────────────────────────────────── */
.ctx-menu {
  position: absolute;
  z-index: 100;
  pointer-events: auto;
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
.ctx-sep { border-top: 1px solid #21262d; margin: 3px 0; }

.result-copy-btn {
  margin-left: auto;
  flex-shrink: 0;
  background: none;
  border: none;
  color: #484f58;
  font-size: 11px;
  cursor: pointer;
  padding: 0 2px;
  line-height: 1;
}
.result-copy-btn:hover { color: #58a6ff; }

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
  pointer-events: auto;
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

.routing-section-title {
  font-size: 9px;
  color: #484f58;
  letter-spacing: 0.05em;
  padding: 4px 8px 2px;
  border-top: 1px solid #21262d;
  margin-top: 2px;
}
.routing-type-filters { padding: 2px 8px 6px; display: flex; flex-direction: column; gap: 3px; }
.routing-type-label { display: flex; align-items: center; gap: 5px; font-size: 10px; color: #8b949e; cursor: pointer; }
.routing-type-label input[type="checkbox"] { accent-color: #58a6ff; cursor: pointer; }

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
