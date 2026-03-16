<template>
  <div class="canvas-wrap" ref="wrapRef">
    <div class="canvas-toolbar">
      <span class="backend-label">{{ connection.name }}</span>
      <button class="tool-btn" @click="refresh" :disabled="loading" title="Refresh">
        <span :class="{ spinning: loading }">↻</span>
      </button>
      <button class="tool-btn" @click="fitView" title="Fit to view">⊡</button>
      <div class="method-mode-btns">
        <button class="tool-btn" :class="{ active: methodDisplay === 'rows' }"   @click="setMethodDisplay('rows')"   title="Method rows">≡</button>
        <button class="tool-btn" :class="{ active: methodDisplay === 'dots' }"   @click="setMethodDisplay('dots')"   title="Method dots">·</button>
        <button class="tool-btn" :class="{ active: methodDisplay === 'hidden' }" @click="setMethodDisplay('hidden')" title="Hide methods">☐</button>
      </div>
      <span class="canvas-hint">drag · scroll to zoom</span>
    </div>
    <canvas
      ref="canvasRef"
      class="main-canvas"
      @mousedown="onMouseDown"
      @mousemove="onMouseMove"
      @mouseup="onMouseUp"
      @mouseleave="onMouseLeave"
      @wheel.prevent="onWheel"
    />
    <div v-if="loading && !rootNode" class="overlay">
      <span class="pulse">◌</span>&nbsp;Scanning…
    </div>
    <div v-if="connectError" class="overlay error">{{ connectError }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { getSharedClient } from '../lib/plexus/clientRegistry'
import { getCachedTree } from '../lib/plexus/schemaCache'
import type { PluginNode, MethodSchema } from '../plexus-schema'

const props = defineProps<{ connection: { name: string; url: string } }>()

const emit = defineEmits<{
  select: [path: string[]]
}>()

const wrapRef      = ref<HTMLDivElement | null>(null)
const canvasRef    = ref<HTMLCanvasElement | null>(null)
const loading      = ref(false)
const connectError = ref('')

// ─── Method display mode ─────────────────────────────────────
type MethodDisplay = 'rows' | 'dots' | 'hidden'
const methodDisplay = ref<MethodDisplay>('rows')

function setMethodDisplay(m: MethodDisplay) {
  methodDisplay.value = m
  if (rootNode) {
    rebuildHeights(rootNode)
    allNodes = []; allEdges = []
    layoutNode(rootNode, 0, { v: 0 })
    collectAll(rootNode, allNodes, allEdges)
  }
  render()
}

// ─── Pan / zoom ──────────────────────────────────────────────
let panX = 40, panY = 40, scale = 1
let isPanning = false, lastMX = 0, lastMY = 0, mouseMoved = 0

// ─── Layout constants ────────────────────────────────────────
const NODE_W         = 180
const HEADER_H       = 32
const METHOD_ROW_H   = 20
const METHOD_PAD_B   = 8
const METHOD_DOT_R   = 3
const METHOD_DOT_GAP = 8
const H_GAP          = 52
const V_GAP          = 10

// ─── Node type ───────────────────────────────────────────────
interface CNode {
  id: string
  type: 'hub' | 'leaf'
  label: string
  description: string
  methods: MethodSchema[]
  path: string[]
  children: CNode[]
  x: number; y: number; w: number; h: number
}

let rootNode: CNode | null = null
let allNodes: CNode[] = []
let allEdges: [CNode, CNode][] = []

// ─── Height calculation (mode-aware) ─────────────────────────
function nodeHeight(methods: MethodSchema[], isHub: boolean): number {
  if (isHub) return HEADER_H
  const md = methodDisplay.value
  if (md === 'hidden' || methods.length === 0) return HEADER_H
  if (md === 'dots') {
    const cols = Math.floor((NODE_W - 24) / METHOD_DOT_GAP)
    const rows = Math.ceil(methods.length / cols)
    return HEADER_H + rows * METHOD_DOT_GAP + 8
  }
  return HEADER_H + 1 + methods.length * METHOD_ROW_H + METHOD_PAD_B
}

function rebuildHeights(node: CNode): void {
  node.h = nodeHeight(node.methods, node.type === 'hub')
  for (const c of node.children) rebuildHeights(c)
}

// ─── Build tree ───────────────────────────────────────────────
function buildCNode(node: PluginNode): CNode {
  const id = node.path.join('.') || node.schema.namespace
  const methods = node.schema.methods
  const children = node.children.map(buildCNode)
  const isHub = node.children.length > 0
  return {
    id,
    type: isHub ? 'hub' : 'leaf',
    label: node.schema.namespace,
    description: node.schema.description,
    methods, path: node.path, children,
    x: 0, y: 0, w: NODE_W,
    h: nodeHeight(methods, isHub),
  }
}

// ─── Layout: left-to-right tree ──────────────────────────────
function layoutNode(node: CNode, x: number, yRef: { v: number }): void {
  node.x = x
  const childX = x + node.w + H_GAP
  if (node.children.length === 0) {
    node.y = yRef.v
    yRef.v += node.h + V_GAP
    return
  }
  for (const c of node.children) layoutNode(c, childX, yRef)
  const first = node.children[0]!
  const last  = node.children[node.children.length - 1]!
  node.y = (first.y + last.y + last.h) / 2 - node.h / 2
}

function collectAll(node: CNode, nodes: CNode[], edges: [CNode, CNode][]): void {
  nodes.push(node)
  for (const c of node.children) {
    edges.push([node, c])
    collectAll(c, nodes, edges)
  }
}

// ─── Canvas drawing ──────────────────────────────────────────
function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y,     x + w, y + r,     r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x,     y + h, x,     y + h - r,  r)
  ctx.lineTo(x,     y + r)
  ctx.arcTo(x,     y,     x + r, y,           r)
  ctx.closePath()
}

function drawEdge(ctx: CanvasRenderingContext2D, from: CNode, to: CNode): void {
  const x1 = from.x + from.w, y1 = from.y + from.h / 2
  const x2 = to.x,            y2 = to.y  + HEADER_H / 2
  const cx = (x1 + x2) / 2
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.bezierCurveTo(cx, y1, cx, y2, x2, y2)
  ctx.strokeStyle = '#252b35'
  ctx.lineWidth = 1
  ctx.stroke()
}

const FONT_MONO = 'ui-monospace, "Cascadia Code", "Fira Code", monospace'

function drawNode(ctx: CanvasRenderingContext2D, node: CNode): void {
  const { x, y, w, h, type, label, methods } = node
  const isHub = type === 'hub'
  const md = methodDisplay.value

  rrect(ctx, x, y, w, h, 6)
  ctx.fillStyle   = isHub ? '#14192a' : '#10111a'
  ctx.fill()
  ctx.strokeStyle = isHub ? '#283660' : '#1e2535'
  ctx.lineWidth   = 1
  ctx.stroke()

  ctx.fillStyle    = isHub ? '#7aabff' : 'var(--text)'
  ctx.font         = `600 12px ${FONT_MONO}`
  ctx.textBaseline = 'middle'
  ctx.textAlign    = 'left'
  ctx.save()
  ctx.beginPath(); ctx.rect(x + 10, y, w - 20, HEADER_H); ctx.clip()
  ctx.fillText(label, x + 12, y + HEADER_H / 2)
  ctx.restore()

  if (isHub && node.children.length > 0) {
    ctx.font      = `10px ${FONT_MONO}`
    ctx.fillStyle = '#3a4a6b'
    ctx.textAlign = 'right'
    ctx.fillText(`${node.children.length}`, x + w - 10, y + HEADER_H / 2)
  }

  if (!isHub && methods.length > 0 && md !== 'hidden') {
    if (md === 'rows') {
      ctx.beginPath()
      ctx.moveTo(x + 1, y + HEADER_H)
      ctx.lineTo(x + w - 1, y + HEADER_H)
      ctx.strokeStyle = '#1e2535'
      ctx.lineWidth = 1
      ctx.stroke()

      methods.forEach((m, i) => {
        const my = y + HEADER_H + 1 + i * METHOD_ROW_H
        const isStream = m.streaming, isBidir = m.bidirectional
        const nameColor = isStream ? '#4e9eff' : isBidir ? '#a070ef' : '#4ab060'
        ctx.font = `11px ${FONT_MONO}`
        ctx.textBaseline = 'middle'
        ctx.fillStyle = nameColor
        ctx.textAlign = 'left'
        ctx.save()
        ctx.beginPath(); ctx.rect(x + 10, my, w - 30, METHOD_ROW_H); ctx.clip()
        ctx.fillText(m.name, x + 14, my + METHOD_ROW_H / 2)
        ctx.restore()
        if (isStream || isBidir) {
          ctx.font = `9px ${FONT_MONO}`
          ctx.fillStyle = isStream ? '#2a4060' : '#3a2060'
          ctx.textAlign = 'right'
          ctx.fillText(isStream ? '↓' : '⇄', x + w - 8, my + METHOD_ROW_H / 2)
        }
      })
    } else if (md === 'dots') {
      let dx = x + 12, dy = y + HEADER_H + METHOD_DOT_GAP / 2 + 2
      for (const m of methods) {
        const isStream = m.streaming, isBidir = m.bidirectional
        const color = isStream ? '#4e9eff' : isBidir ? '#a070ef' : '#4ab060'
        ctx.beginPath()
        ctx.arc(dx, dy, METHOD_DOT_R, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.fill()
        dx += METHOD_DOT_GAP
        if (dx + METHOD_DOT_R > x + w - 8) { dx = x + 12; dy += METHOD_DOT_GAP }
      }
    }
  }
}

function render(): void {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const dpr = Number(canvas.dataset.dpr || '1')

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = 'var(--bg-0)'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  if (!rootNode) return

  ctx.save()
  ctx.scale(dpr, dpr)
  ctx.translate(panX, panY)
  ctx.scale(scale, scale)

  for (const [from, to] of allEdges) drawEdge(ctx, from, to)
  for (const node of allNodes)       drawNode(ctx, node)

  ctx.restore()
}

// ─── Fit view ────────────────────────────────────────────────
function fitView(): void {
  const canvas = canvasRef.value
  if (!canvas || allNodes.length === 0) return

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const n of allNodes) {
    minX = Math.min(minX, n.x);         minY = Math.min(minY, n.y)
    maxX = Math.max(maxX, n.x + n.w);   maxY = Math.max(maxY, n.y + n.h)
  }
  const pad   = 48
  const treeW = maxX - minX, treeH = maxY - minY
  const dpr = Number(canvas.dataset.dpr || '1')
  const cW = (canvas.width || 1280) / dpr
  const cH = (canvas.height || 720) / dpr
  const s  = Math.min((cW - pad * 2) / treeW, (cH - pad * 2) / treeH)
  scale = Math.min(Math.max(s, 0.04), 1)
  panX  = pad - minX * scale
  panY  = (cH - treeH * scale) / 2 - minY * scale
  render()
}

// ─── Initial view ────────────────────────────────────────────
function initialView(): void {
  const canvas = canvasRef.value
  if (!canvas || !rootNode) return
  const dpr = Number(canvas.dataset.dpr || '1')
  const cH  = (canvas.height || 720) / dpr
  scale = 0.65
  panX  = 48
  panY  = cH / 2 - (rootNode.y + rootNode.h / 2) * scale
  render()
}

// ─── Resize ──────────────────────────────────────────────────
function resize(): void {
  const canvas = canvasRef.value
  if (!canvas) return
  const dpr = window.devicePixelRatio || 1
  const w = canvas.offsetWidth, h = canvas.offsetHeight
  if (w === 0 || h === 0) return
  canvas.width  = w * dpr
  canvas.height = h * dpr
  canvas.dataset.dpr = String(dpr)
  render()
}

// ─── Mouse events ────────────────────────────────────────────
function onMouseDown(e: MouseEvent): void {
  isPanning = true; lastMX = e.clientX; lastMY = e.clientY; mouseMoved = 0
  canvasRef.value!.style.cursor = 'grabbing'
}

function onMouseMove(e: MouseEvent): void {
  if (!isPanning) return
  const dx = e.clientX - lastMX, dy = e.clientY - lastMY
  panX += dx; panY += dy
  mouseMoved += Math.abs(dx) + Math.abs(dy)
  lastMX = e.clientX; lastMY = e.clientY
  render()
}

function onMouseUp(e: MouseEvent): void {
  if (isPanning && mouseMoved < 3) {
    const canvas = canvasRef.value
    if (canvas) {
      const rect = canvas.getBoundingClientRect()
      const cx = (e.clientX - rect.left - panX) / scale
      const cy = (e.clientY - rect.top  - panY) / scale
      for (const node of allNodes) {
        if (cx >= node.x && cx <= node.x + node.w && cy >= node.y && cy <= node.y + node.h) {
          emit('select', node.path)
          break
        }
      }
    }
  }
  isPanning = false
  if (canvasRef.value) canvasRef.value.style.cursor = 'grab'
}

function onMouseLeave(): void {
  isPanning = false
  if (canvasRef.value) canvasRef.value.style.cursor = 'grab'
}

function onWheel(e: WheelEvent): void {
  const canvas = canvasRef.value!
  const rect = canvas.getBoundingClientRect()
  const mx = e.clientX - rect.left, my = e.clientY - rect.top
  if (e.ctrlKey) {
    // pinch-to-zoom (browser sets ctrlKey for pinch gestures)
    const f = e.deltaY < 0 ? 1.02 : 1 / 1.02
    panX = mx + f * (panX - mx)
    panY = my + f * (panY - my)
    scale = Math.min(Math.max(scale * f, 0.04), 8)
  } else {
    // two-finger scroll → pan
    panX -= e.deltaX
    panY -= e.deltaY
  }
  render()
}

// ─── Data loading ────────────────────────────────────────────
const rpc = getSharedClient(props.connection.name, props.connection.url)

async function refresh(): Promise<void> {
  loading.value = true
  connectError.value = ''
  try {
    await rpc.connect()
    const pluginTree = await getCachedTree(rpc, props.connection.name)
    rootNode = buildCNode(pluginTree)
    allNodes = []; allEdges = []
    layoutNode(rootNode, 0, { v: 0 })
    collectAll(rootNode, allNodes, allEdges)
    initialView()
  } catch (e) {
    connectError.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

// ─── Lifecycle ───────────────────────────────────────────────
let ro: ResizeObserver

onMounted(async () => {
  await new Promise(r => requestAnimationFrame(r))
  resize()
  ro = new ResizeObserver(resize)
  if (wrapRef.value) ro.observe(wrapRef.value)
  if (canvasRef.value) canvasRef.value.style.cursor = 'grab'
  await refresh()
})

onUnmounted(() => {
  ro?.disconnect()
})
</script>

<style scoped>
.canvas-wrap {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-0);
  min-width: 0;
}

.canvas-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-0);
  flex-shrink: 0;
  font-family: 'Berkeley Mono', 'Fira Code', 'Cascadia Code', ui-monospace, monospace;
}

.backend-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--accent);
}

.tool-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 14px;
  padding: 2px 5px;
  border-radius: 4px;
  line-height: 1;
  font-family: inherit;
}
.tool-btn:hover:not(:disabled) { color: var(--text); background: var(--border); }
.tool-btn:disabled { opacity: 0.4; cursor: default; }
.tool-btn.active { color: var(--accent); background: var(--accent-bg); }

.method-mode-btns {
  display: flex;
  border: 1px solid var(--border-2);
  border-radius: 4px;
  overflow: hidden;
}
.method-mode-btns .tool-btn { border: none; border-radius: 0; }

.canvas-hint {
  font-size: 10px;
  color: var(--text-dim);
  margin-left: auto;
}

.main-canvas {
  flex: 1;
  display: block;
  width: 100%;
  min-height: 0;
  touch-action: none;
}

.overlay {
  position: absolute;
  inset: 40px 0 0 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-muted);
  pointer-events: none;
  font-family: 'Berkeley Mono', 'Fira Code', ui-monospace, monospace;
}
.overlay.error {
  color: var(--red);
  background: rgba(45, 17, 23, 0.7);
}

@keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
.pulse { animation: pulse 1.2s ease-in-out infinite; }

@keyframes spin { to { transform: rotate(360deg); } }
.spinning { display: inline-block; animation: spin 0.8s linear infinite; }
</style>
