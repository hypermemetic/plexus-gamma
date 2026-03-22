<template>
  <div
    class="builder-node"
    :class="{ selected }"
    :style="nodeStyle"
    @mousedown.stop="onNodeMouseDown"
  >
    <!-- Preview label (type + binding) -->
    <div class="bn-label">
      <span class="bn-type">{{ component.type }}</span>
      <span v-if="component.binding" class="bn-bound">→ {{ component.binding.method }}</span>
    </div>

    <!-- Content preview -->
    <div class="bn-content">
      <component-preview :component="component" />
    </div>

    <!-- Delete button (selected only) -->
    <button v-if="selected" class="bn-delete" @mousedown.stop @click.stop="$emit('delete')">✕</button>

    <!-- Resize handle (selected only) -->
    <div v-if="selected" class="bn-resize" @mousedown.stop="onResizeMouseDown" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ComponentInstance } from './types'
import ComponentPreview from './ComponentPreview.vue'

const props = defineProps<{
  component: ComponentInstance
  selected:  boolean
}>()

const emit = defineEmits<{
  select:  []
  move:    [x: number, y: number]
  resize:  [w: number, h: number]
  delete:  []
}>()

const nodeStyle = computed(() => ({
  left:   props.component.x + 'px',
  top:    props.component.y + 'px',
  width:  props.component.width + 'px',
  height: props.component.height + 'px',
}))

// ─── Drag to move ─────────────────────────────────────────
function onNodeMouseDown(e: MouseEvent) {
  emit('select')
  if (e.button !== 0) return
  const startX = e.clientX - props.component.x
  const startY = e.clientY - props.component.y

  function onMouseMove(e: MouseEvent) {
    emit('move', e.clientX - startX, e.clientY - startY)
  }
  function onMouseUp() {
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  }
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

// ─── Drag to resize ───────────────────────────────────────
function onResizeMouseDown(e: MouseEvent) {
  e.preventDefault()
  const startX = e.clientX
  const startY = e.clientY
  const startW = props.component.width
  const startH = props.component.height

  function onMouseMove(e: MouseEvent) {
    emit('resize', startW + (e.clientX - startX), startH + (e.clientY - startY))
  }
  function onMouseUp() {
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  }
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}
</script>

<style scoped>
.builder-node {
  position: absolute;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-3);
  cursor: move;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transition: border-color 0.1s, box-shadow 0.1s;
}
.builder-node:hover { border-color: var(--border-2); }
.builder-node.selected {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}

.bn-label {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  background: var(--bg-2);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.bn-type {
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-dim);
}
.bn-bound {
  font-size: 9px;
  color: var(--accent);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.bn-content {
  flex: 1;
  overflow: hidden;
  padding: 6px 8px;
  font-size: 12px;
  color: var(--text-muted);
  pointer-events: none;
}

.bn-delete {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 18px;
  height: 18px;
  background: rgba(255,80,80,0.15);
  border: none;
  border-radius: 3px;
  color: #f87171;
  font-size: 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  z-index: 10;
}
.bn-delete:hover { background: rgba(255,80,80,0.3); }

.bn-resize {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 12px;
  height: 12px;
  cursor: nwse-resize;
  background: linear-gradient(135deg, transparent 50%, var(--accent) 50%);
  opacity: 0.5;
}
.builder-node.selected .bn-resize { opacity: 1; }
</style>
