<template>
  <div v-if="open" class="uip-overlay" @mousedown.stop @click.stop @wheel.stop @keydown.stop>
    <div class="uip-panel">
      <div class="uip-chrome">
        <span class="uip-title">UI Preview</span>
        <button class="uip-close" @click="emit('close')" title="Close preview">✕</button>
      </div>
      <div class="uip-body">
        <div v-if="rootNodes.length === 0" class="uip-empty">
          Add <strong>widget</strong> or <strong>layout</strong> nodes from the sidebar, then connect them.
        </div>
        <template v-else>
          <UINodeRender
            v-for="node in rootNodes"
            :key="node.id"
            :node="node"
            :nodes="nodes"
            :edges="edges"
            @param-update="emit('param-update', $event)"
            @trigger="emit('trigger', $event)"
          />
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { WireNode, WireEdge } from './wiringTypes'
import UINodeRender from './UINodeRender.vue'

const props = defineProps<{
  open: boolean
  nodes: WireNode[]
  edges: WireEdge[]
}>()

const emit = defineEmits<{
  close: []
  'param-update': [{ nodeId: string; key: string; value: unknown }]
  trigger: [string]
}>()

// IDs of nodes that are children of a layout node (not top-level)
const layoutChildIds = computed(() => {
  const ids = new Set<string>()
  for (const edge of props.edges) {
    const toNode = props.nodes.find(n => n.id === edge.toNodeId)
    if (toNode?.kind === 'layout') ids.add(edge.fromNodeId)
  }
  return ids
})

// Root UI nodes: widget/layout nodes not nested inside another layout
const rootNodes = computed(() =>
  props.nodes.filter(n =>
    (n.kind === 'widget' || n.kind === 'layout') && !layoutChildIds.value.has(n.id)
  )
)
</script>

<style scoped>
.uip-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 32px 24px;
  background: rgba(8, 10, 14, 0.7);
  backdrop-filter: blur(2px);
  pointer-events: auto;
  z-index: 500;
  overflow: auto;
}

.uip-panel {
  background: #13161c;
  border: 1px solid #30363d;
  border-radius: 10px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.7);
  min-width: 320px;
  max-width: 900px;
  width: 100%;
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 80px);
  overflow: hidden;
}

.uip-chrome {
  display: flex;
  align-items: center;
  padding: 8px 14px 8px 16px;
  border-bottom: 1px solid #21262d;
  background: #1a1d23;
  border-radius: 10px 10px 0 0;
  flex-shrink: 0;
}

.uip-title {
  flex: 1;
  font-size: 11px;
  color: #8b949e;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.uip-close {
  background: none;
  border: none;
  color: #484f58;
  font-size: 13px;
  cursor: pointer;
  padding: 0 2px;
  line-height: 1;
}
.uip-close:hover { color: #f85149; }

.uip-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
  font-family: 'Berkeley Mono', 'Fira Code', ui-monospace, monospace;
}

.uip-empty {
  font-size: 12px;
  color: #484f58;
  text-align: center;
  padding: 32px 0;
}
.uip-empty strong { color: #8b949e; }
</style>
