<template>
  <div class="canvas-wrap" ref="wrapRef">
    <div class="canvas-toolbar">
      <span class="backend-label">{{ connection.name }}</span>
      <button class="tool-btn" @click="refresh" :disabled="loading" title="Refresh">
        <span :class="{ spinning: loading }">↻</span>
      </button>
      <button class="tool-btn" @click="fitView" title="Fit to view">⊡</button>
      <span class="canvas-hint">drag · scroll to zoom</span>
    </div>
    <canvas
      ref="canvasRef"
      class="main-canvas"
      @mousedown="onMouseDown"
      @mousemove="onMouseMove"
      @mouseup="onMouseUp"
      @mouseleave="onMouseUp"
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
import { PlexusRpcClient } from '../lib/plexus/transport'
import { buildTree } from '../schema-walker'
import type { PluginNode, MethodSchema } from '../plexus-schema'

const props = defineProps<{ connection: { name: string; url: string } }>()

const wrapRef      = ref<HTMLDivElement | null>(null)
const canvasRef    = ref<HTMLCanvasElement | null>(null)
const loading      = ref(false)
const connectError = ref('')

// ─── Pan / zoom ──────────────────────────────────────────────
let panX = 40, panY = 40, scale = 1
let isPanning = false, lastMX = 0, lastMY = 0

// ─── Layout constants ────────────────────────────────────────
const NODE_W        = 180   // plugin box width
const HEADER_H      = 32    // plugin header row height
const METHOD_ROW_H  = 20    // height per method row inside the box
const METHOD_PAD_B  = 8     // bottom padding inside box when has methods
const H_GAP         = 52    // horizontal gap between tree levels
const V_GAP         = 10    // vertical gap between sibling nodes

// ─── Node type ───────────────────────────────────────────────
interface CNode {
  id: string
  type: 'hub' | 'leaf'
  label: string
  description: string
  methods: MethodSchema[]
  children: CNode[]
  x: number; y: number; w: number; h: number
}

let rootNode: CNode | null = null
let allNodes: CNode[] = []
let allEdges: [CNode, CNode][] = []

// ─── Build tree (methods stay inside plugin nodes) ────────────
function buildCNode(node: PluginNode): CNode {
  const id = node.path.join('.') || node.schema.namespace
  const methods = node.schema.methods
  const children = node.children.map(buildCNode)
  const isHub = node.children.length > 0
  const h = isHub
    ? HEADER_H
    : HEADER_H + (methods.length > 0 ? 1 + methods.length * METHOD_ROW_H + METHOD_PAD_B : 0)
  return {
    id,
    type: isHub ? 'hub' : 'leaf',
    label: node.schema.namespace,
    description: node.schema.description,
    methods,
    children,
    x: 0, y: 0, w: NODE_W, h,
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
  const first = node.children[0]
  const last  = node.children[node.children.length - 1]
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

  // ── Background & border ──
  const isHub = type === 'hub'
  rrect(ctx, x, y, w, h, 6)
  ctx.fillStyle   = isHub ? '#14192a' : '#10111a'
  ctx.fill()
  ctx.strokeStyle = isHub ? '#283660' : '#1e2535'
  ctx.lineWidth   = 1
  ctx.stroke()

  // ── Header: label ──
  ctx.fillStyle = isHub ? '#7aabff' : '#c9d1d9'
  ctx.font = `600 12px ${FONT_MONO}`
  ctx.textBaseline = 'middle'
  ctx.textAlign    = 'left'
  ctx.save()
  ctx.beginPath(); ctx.rect(x + 10, y, w - 20, HEADER_H); ctx.clip()
  ctx.fillText(label, x + 12, y + HEADER_H / 2)
  ctx.restore()

  // Hub: show child count in header right
  if (isHub && node.children.length > 0) {
    ctx.font = `10px ${FONT_MONO}`
    ctx.fillStyle = '#3a4a6b'
    ctx.textAlign = 'right'
    ctx.fillText(`${node.children.length}`, x + w - 10, y + HEADER_H / 2)
  }

  if (!isHub && methods.length > 0) {
    // ── Divider ──
    ctx.beginPath()
    ctx.moveTo(x + 1, y + HEADER_H)
    ctx.lineTo(x + w - 1, y + HEADER_H)
    ctx.strokeStyle = '#1e2535'
    ctx.lineWidth = 1
    ctx.stroke()

    // ── Method rows ──
    methods.forEach((m, i) => {
      const my = y + HEADER_H + 1 + i * METHOD_ROW_H

      // Streaming/bidir color
      const isStream = m.streaming
      const isBidir  = m.bidirectional
      const nameColor = isStream ? '#4e9eff' : isBidir ? '#a070ef' : '#4ab060'

      ctx.font = `11px ${FONT_MONO}`
      ctx.textBaseline = 'middle'

      // Name
      ctx.fillStyle = nameColor
      ctx.textAlign = 'left'
      ctx.save()
      ctx.beginPath(); ctx.rect(x + 10, my, w - 30, METHOD_ROW_H); ctx.clip()
      ctx.fillText(m.name, x + 14, my + METHOD_ROW_H / 2)
      ctx.restore()

      // Tag (stream/bidir)
      if (isStream || isBidir) {
        ctx.font = `9px ${FONT_MONO}`
        ctx.fillStyle = isStream ? '#2a4060' : '#3a2060'
        ctx.textAlign = 'right'
        ctx.fillText(isStream ? '↓' : '⇄', x + w - 8, my + METHOD_ROW_H / 2)
      }
    })
  }
}

function render(): void {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const dpr = Number(canvas.dataset.dpr || '1')

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#0d0d0f'
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

// ─── Fit view (full tree, ⊡ button) ─────────────────────────
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
  // Use canvas buffer / dpr for CSS pixel dimensions
  const dpr = Number(canvas.dataset.dpr || '1')
  const cW = (canvas.width || 1280) / dpr
  const cH = (canvas.height || 720) / dpr
  const s  = Math.min((cW - pad * 2) / treeW, (cH - pad * 2) / treeH)
  scale = Math.min(Math.max(s, 0.04), 1)
  panX  = pad - minX * scale
  panY  = (cH - treeH * scale) / 2 - minY * scale
  render()
}

// ─── Initial view: center root at readable scale ─────────────
function initialView(): void {
  const canvas = canvasRef.value
  if (!canvas || !rootNode) return
  const dpr = Number(canvas.dataset.dpr || '1')
  const cW  = (canvas.width || 1280) / dpr
  const cH  = (canvas.height || 720) / dpr
  scale = 0.65
  panX  = 48
  // Center the root node vertically in the viewport
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
  isPanning = true; lastMX = e.clientX; lastMY = e.clientY
  canvasRef.value!.style.cursor = 'grabbing'
}
function onMouseMove(e: MouseEvent): void {
  if (!isPanning) return
  panX += e.clientX - lastMX; panY += e.clientY - lastMY
  lastMX = e.clientX; lastMY = e.clientY
  render()
}
function onMouseUp(): void {
  isPanning = false
  if (canvasRef.value) canvasRef.value.style.cursor = 'grab'
}
function onWheel(e: WheelEvent): void {
  const canvas = canvasRef.value!
  const rect = canvas.getBoundingClientRect()
  const mx = e.clientX - rect.left, my = e.clientY - rect.top
  const f = e.deltaY < 0 ? 1.12 : 1 / 1.12
  panX = mx + f * (panX - mx)
  panY = my + f * (panY - my)
  scale = Math.min(Math.max(scale * f, 0.04), 8)
  render()
}

// ─── Data loading ────────────────────────────────────────────
const rpc = new PlexusRpcClient({ backend: props.connection.name, url: props.connection.url })

async function refresh(): Promise<void> {
  loading.value = true
  connectError.value = ''
  try {
    await rpc.connect()
    const pluginTree = await buildTree(rpc, props.connection.name)
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
  // Give flexbox a tick to lay out before we read dimensions
  await new Promise(r => requestAnimationFrame(r))
  resize()
  ro = new ResizeObserver(resize)
  if (wrapRef.value) ro.observe(wrapRef.value)
  if (canvasRef.value) canvasRef.value.style.cursor = 'grab'
  await refresh()
})

onUnmounted(() => {
  ro?.disconnect()
  rpc.disconnect()
})
</script>

<style scoped>
.canvas-wrap {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #0d0d0f;
  min-width: 0;
}

.canvas-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-bottom: 1px solid #21262d;
  background: #0a0a0c;
  flex-shrink: 0;
  font-family: 'Berkeley Mono', 'Fira Code', 'Cascadia Code', ui-monospace, monospace;
}

.backend-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #58a6ff;
}

.tool-btn {
  background: none;
  border: none;
  color: #8b949e;
  cursor: pointer;
  font-size: 14px;
  padding: 2px 5px;
  border-radius: 4px;
  line-height: 1;
  font-family: inherit;
}
.tool-btn:hover:not(:disabled) { color: #c9d1d9; background: #21262d; }
.tool-btn:disabled { opacity: 0.4; cursor: default; }

.canvas-hint {
  font-size: 10px;
  color: #484f58;
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
  color: #8b949e;
  pointer-events: none;
  font-family: 'Berkeley Mono', 'Fira Code', ui-monospace, monospace;
}
.overlay.error {
  color: #f85149;
  background: rgba(45, 17, 23, 0.7);
}

@keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
.pulse { animation: pulse 1.2s ease-in-out infinite; }

@keyframes spin { to { transform: rotate(360deg); } }
.spinning { display: inline-block; animation: spin 0.8s linear infinite; }
</style>
