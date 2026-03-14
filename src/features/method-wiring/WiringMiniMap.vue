<template>
  <svg
    v-if="nodes.length > 0"
    class="wiring-minimap"
    :width="MAP_W"
    :height="MAP_H"
    :viewBox="`0 0 ${MAP_W} ${MAP_H}`"
    @click="onMapClick"
  >
    <rect width="100%" height="100%" :fill="BG_COLOR" />

    <!-- Edges -->
    <line
      v-for="edge in edges"
      :key="edge.id"
      v-bind="edgeLine(edge)"
      stroke="#1f3a5f"
      stroke-width="0.8"
    />

    <!-- Nodes -->
    <rect
      v-for="node in nodes"
      :key="node.id"
      v-bind="nodeRect(node)"
      :fill="nodeFill(node.kind)"
      :stroke="nodeStroke(node.status)"
      stroke-width="0.8"
      rx="1"
    />

    <!-- Viewport rect -->
    <rect
      v-bind="viewportRect"
      fill="rgba(88,166,255,0.08)"
      stroke="#58a6ff"
      stroke-width="0.8"
    />
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { WireNode, WireEdge, NodeKind } from './wiringTypes'

const props = defineProps<{
  nodes: WireNode[]
  edges: WireEdge[]
  pan: { x: number; y: number }
  zoom: number
  viewportW: number
  viewportH: number
}>()

const emit = defineEmits<{
  'pan-to': [{ x: number; y: number }]
}>()

const MAP_W = 160
const MAP_H = 120
const PADDING = 6
const BG_COLOR = '#0a0c12'

// Bounding box of all nodes in canvas space
const bbox = computed(() => {
  if (props.nodes.length === 0) return { minX: 0, minY: 0, maxX: 400, maxY: 300 }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const n of props.nodes) {
    if (n.pos.x < minX) minX = n.pos.x
    if (n.pos.y < minY) minY = n.pos.y
    if (n.pos.x + n.w > maxX) maxX = n.pos.x + n.w
    if (n.pos.y + 60 > maxY) maxY = n.pos.y + 60  // approx node height
  }
  return { minX, minY, maxX, maxY }
})

// Scale factor: map canvas coords → minimap px
const scale = computed(() => {
  const bb = bbox.value
  const usableW = MAP_W - PADDING * 2
  const usableH = MAP_H - PADDING * 2
  const scaleX = usableW / Math.max(bb.maxX - bb.minX, 1)
  const scaleY = usableH / Math.max(bb.maxY - bb.minY, 1)
  return Math.min(scaleX, scaleY)
})

function toMap(cx: number, cy: number): { x: number; y: number } {
  const bb = bbox.value
  const s = scale.value
  return {
    x: PADDING + (cx - bb.minX) * s,
    y: PADDING + (cy - bb.minY) * s,
  }
}

function nodeRect(node: WireNode) {
  const { x, y } = toMap(node.pos.x, node.pos.y)
  const w = Math.max(2, node.w * scale.value)
  const h = Math.max(2, 60 * scale.value)
  return { x, y, width: w, height: h }
}

function nodeFill(kind: NodeKind): string {
  switch (kind) {
    case 'extract':  return '#3a2a0a'
    case 'template': return '#1a2a10'
    case 'merge':    return '#0a2a2a'
    case 'script':   return '#2a0a3a'
    default:         return '#1a2a40'
  }
}

function nodeStroke(status: WireNode['status']): string {
  switch (status) {
    case 'done':    return '#3fb950'
    case 'error':   return '#f85149'
    case 'running': return '#58a6ff'
    default:        return '#21262d'
  }
}

function edgeLine(edge: WireEdge) {
  const fromNode = props.nodes.find(n => n.id === edge.fromNodeId)
  const toNode = props.nodes.find(n => n.id === edge.toNodeId)
  if (!fromNode || !toNode) return { x1: 0, y1: 0, x2: 0, y2: 0 }
  const from = toMap(fromNode.pos.x + fromNode.w, fromNode.pos.y + 30)
  const to   = toMap(toNode.pos.x, toNode.pos.y + 30)
  return { x1: from.x, y1: from.y, x2: to.x, y2: to.y }
}

// Viewport rect in minimap coords
const viewportRect = computed(() => {
  // The canvas transform is: translate(pan.x, pan.y) scale(zoom)
  // A canvas point cx,cy appears at screen px: cx*zoom + pan.x
  // Screen top-left = (0,0) => canvas coord = -pan.x/zoom, -pan.y/zoom
  // Screen bottom-right = (vw, vh) => canvas coord = (vw - pan.x)/zoom, (vh - pan.y)/zoom
  const vl = -props.pan.x / props.zoom
  const vt = -props.pan.y / props.zoom
  const vr = (props.viewportW - props.pan.x) / props.zoom
  const vb = (props.viewportH - props.pan.y) / props.zoom
  const tl = toMap(vl, vt)
  const br = toMap(vr, vb)
  return {
    x: tl.x,
    y: tl.y,
    width: Math.max(4, br.x - tl.x),
    height: Math.max(4, br.y - tl.y),
  }
})

function onMapClick(e: MouseEvent) {
  const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
  const mx = (e.clientX - rect.left) * (MAP_W / rect.width)
  const my = (e.clientY - rect.top)  * (MAP_H / rect.height)
  const bb = bbox.value
  const s = scale.value
  const cx = bb.minX + (mx - PADDING) / s
  const cy = bb.minY + (my - PADDING) / s
  emit('pan-to', { x: cx, y: cy })
}
</script>

<style scoped>
.wiring-minimap {
  position: absolute;
  bottom: 12px;
  right: 12px;
  border: 1px solid #21262d;
  border-radius: 6px;
  cursor: crosshair;
  pointer-events: all;
  z-index: 50;
}
</style>
