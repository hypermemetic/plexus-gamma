<template>
  <div
    class="builder-node"
    :class="{ selected, hovered }"
    :style="nodeStyle"
    @mousedown.stop="onNodeMouseDown"
    @mouseenter="hovered = true"
    @mouseleave="hovered = false"
  >
    <!-- Actual component content — looks like a real webpage element -->
    <div class="bn-content">
      <ComponentPreview :component="component" />
    </div>

    <!-- Floating toolbar — only on hover/select, never in the way of content -->
    <div v-if="selected || hovered" class="bn-toolbar" @mousedown.stop>
      <span class="bn-toolbar-type">{{ component.type }}</span>
      <span v-if="component.binding" class="bn-toolbar-bound">{{ component.binding.method }}</span>
      <button class="bn-toolbar-btn" title="Delete" @click.stop="$emit('delete')">✕</button>
    </div>

    <!-- Resize handle — only when selected -->
    <div v-if="selected" class="bn-resize" @mousedown.stop="onResizeMouseDown" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
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

const hovered = ref(false)

const nodeStyle = computed(() => ({
  left:   props.component.x + 'px',
  top:    props.component.y + 'px',
  width:  props.component.width + 'px',
  height: props.component.height + 'px',
}))

function onNodeMouseDown(e: MouseEvent) {
  emit('select')
  if (e.button !== 0) return
  const startX = e.clientX - props.component.x
  const startY = e.clientY - props.component.y
  function onMove(e: MouseEvent) { emit('move', e.clientX - startX, e.clientY - startY) }
  function onUp() { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

function onResizeMouseDown(e: MouseEvent) {
  e.preventDefault()
  const startX = e.clientX, startY = e.clientY
  const startW = props.component.width, startH = props.component.height
  function onMove(e: MouseEvent) { emit('resize', startW + (e.clientX - startX), startH + (e.clientY - startY)) }
  function onUp() { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}
</script>

<style scoped>
.builder-node {
  position: absolute;
  cursor: move;
  border: 1px solid transparent;
  border-radius: 2px;
  transition: border-color 0.1s;
  overflow: visible;
}
.builder-node.hovered  { border-color: rgba(47, 129, 247, 0.4); }
.builder-node.selected { border-color: #2f81f7; box-shadow: 0 0 0 1px #2f81f7; }

.bn-content {
  width: 100%;
  height: 100%;
  overflow: hidden;
  pointer-events: none;
}

/* Floating toolbar — appears above the node */
.bn-toolbar {
  position: absolute;
  top: -26px;
  left: 0;
  height: 22px;
  display: flex;
  align-items: center;
  gap: 6px;
  background: #1c2128;
  border: 1px solid #2f81f7;
  border-radius: 4px;
  padding: 0 6px;
  font-size: 10px;
  white-space: nowrap;
  z-index: 100;
  box-shadow: 0 2px 8px rgba(0,0,0,0.4);
}
.bn-toolbar-type { color: #58a6ff; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; }
.bn-toolbar-bound { color: #8b949e; max-width: 160px; overflow: hidden; text-overflow: ellipsis; font-family: monospace; }
.bn-toolbar-btn {
  background: none; border: none; color: #6e7681; cursor: pointer; padding: 0; font-size: 11px; line-height: 1;
  margin-left: 2px;
}
.bn-toolbar-btn:hover { color: #f87171; }

.bn-resize {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 10px;
  height: 10px;
  cursor: nwse-resize;
  background: #2f81f7;
  clip-path: polygon(100% 0, 100% 100%, 0 100%);
}
</style>
