<template>
  <div
    class="float-panel"
    :class="panelClass"
    :style="effectiveMode === 'float' ? floatStyle : {}"
    ref="panelEl"
    @pointerdown.stop
    @mousedown.stop
    @wheel.stop
    @click.stop
  >
    <!-- Header -->
    <div
      class="panel-handle-row"
      @pointerdown.stop="effectiveMode === 'float' ? onDragStart($event) : undefined"
    >
      <span v-if="effectiveMode === 'float'" class="panel-drag-handle">⠿</span>
      <slot name="title">
        <span class="panel-title">{{ title }}</span>
      </slot>
      <div class="mode-toggle">
        <button class="mode-btn" :class="{ active: effectiveMode === 'float'  }" title="Hover card"   @click.stop="emit('update:mode', 'float')">⊡</button>
        <button class="mode-btn" :class="{ active: effectiveMode === 'right'  }" title="Right panel"  @click.stop="emit('update:mode', 'right')">▷</button>
        <button class="mode-btn" :class="{ active: effectiveMode === 'bottom' }" title="Bottom sheet" @click.stop="emit('update:mode', 'bottom')">▽</button>
      </div>
      <button class="panel-close-btn" @click.stop="emit('close')" title="Close">✕</button>
    </div>

    <!-- Body (slot content) -->
    <slot />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'

export type PanelMode = 'float' | 'right' | 'bottom'

const props = defineProps<{
  open: boolean
  anchorX: number
  anchorY: number
  anchorW: number
  mode?: PanelMode
  title?: string
}>()

const emit = defineEmits<{
  close: []
  'update:mode': [PanelMode]
}>()

const panelEl    = ref<HTMLElement | null>(null)
const panelW     = ref(300)
const panelH     = ref(200)
const dragOffset = ref<{ x: number; y: number } | null>(null)
const manualPos  = ref<{ left: number; top: number } | null>(null)

const isMobile = computed(() => typeof window !== 'undefined' && window.innerWidth < 680)
const effectiveMode = computed<PanelMode>(() => isMobile.value ? 'bottom' : (props.mode ?? 'float'))

const panelClass = computed(() => ({
  [`panel-${effectiveMode.value}`]: true,
  'panel-open':   effectiveMode.value !== 'float' && props.open,
  'panel-hidden': effectiveMode.value === 'float' && !props.open,
}))

const floatStyle = computed(() => {
  if (manualPos.value) {
    return { left: manualPos.value.left + 'px', top: manualPos.value.top + 'px' }
  }
  const containerW = panelEl.value?.offsetParent?.clientWidth  ?? window.innerWidth
  const containerH = panelEl.value?.offsetParent?.clientHeight ?? window.innerHeight
  let left = props.anchorX + props.anchorW + 14
  if (left + panelW.value > containerW - 8) left = props.anchorX - panelW.value - 14
  if (left < 4) left = 4
  let top = props.anchorY
  if (top + panelH.value > containerH - 8) top = containerH - panelH.value - 8
  if (top < 4) top = 4
  return { left: left + 'px', top: top + 'px' }
})

// Reset manual position and re-measure when panel opens
watch(() => props.open, (newVal, oldVal) => {
  if (newVal && !oldVal) {
    manualPos.value = null
    nextTick(() => {
      if (panelEl.value) {
        panelW.value = panelEl.value.offsetWidth  || 300
        panelH.value = panelEl.value.offsetHeight || 200
      }
    })
  }
})

function onDragStart(e: PointerEvent) {
  if (!panelEl.value) return
  const rect = panelEl.value.getBoundingClientRect()
  dragOffset.value = { x: e.clientX - rect.left, y: e.clientY - rect.top }
  document.addEventListener('pointermove', onDragMove)
  document.addEventListener('pointerup', onDragEnd)
}
function onDragMove(e: PointerEvent) {
  if (!dragOffset.value) return
  manualPos.value = { left: e.clientX - dragOffset.value.x, top: e.clientY - dragOffset.value.y }
}
function onDragEnd() {
  dragOffset.value = null
  document.removeEventListener('pointermove', onDragMove)
  document.removeEventListener('pointerup', onDragEnd)
}

function onKeyDown(e: KeyboardEvent) {
  if (!props.open) return
  if (e.key === 'Escape') emit('close')
}
function onDocPointerDown(e: PointerEvent) {
  if (!props.open) return
  if (effectiveMode.value !== 'float') return
  if (dragOffset.value) return
  if (!panelEl.value) return
  if (!panelEl.value.contains(e.target as Node)) emit('close')
}

onMounted(() => {
  document.addEventListener('keydown', onKeyDown)
  document.addEventListener('pointerdown', onDocPointerDown)
  nextTick(() => {
    if (panelEl.value) {
      panelW.value = panelEl.value.offsetWidth  || 300
      panelH.value = panelEl.value.offsetHeight || 200
    }
  })
})
onUnmounted(() => {
  document.removeEventListener('keydown', onKeyDown)
  document.removeEventListener('pointerdown', onDocPointerDown)
  document.removeEventListener('pointermove', onDragMove)
  document.removeEventListener('pointerup', onDragEnd)
})
</script>

<style scoped>
/* ── Base ────────────────────────────────────────────────────── */
.float-panel {
  background: #13161c;
  border: 1px solid #30363d;
  z-index: 300;
  font-family: 'Berkeley Mono', 'Fira Code', ui-monospace, monospace;
  font-size: 12px;
  color: #c9d1d9;
  display: flex;
  flex-direction: column;
  pointer-events: auto;
}

.panel-hidden { display: none; }

/* ── Float ───────────────────────────────────────────────────── */
.panel-float {
  position: absolute;
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.6);
  min-width: 260px;
  max-width: 380px;
  overflow: hidden;
}

/* ── Right drawer ────────────────────────────────────────────── */
.panel-right {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 300px;
  border: none;
  border-left: 1px solid #30363d;
  border-radius: 0;
  box-shadow: -4px 0 24px rgba(0,0,0,0.5);
  transform: translateX(100%);
  transition: transform 0.22s ease;
  overflow: hidden;
}
.panel-right.panel-open { transform: translateX(0); }

/* ── Bottom sheet ────────────────────────────────────────────── */
.panel-bottom {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  max-height: 55vh;
  border: none;
  border-top: 1px solid #30363d;
  border-radius: 0;
  box-shadow: 0 -4px 24px rgba(0,0,0,0.5);
  transform: translateY(100%);
  transition: transform 0.22s ease;
  overflow: hidden;
}
.panel-bottom.panel-open { transform: translateY(0); }

/* ── Header ──────────────────────────────────────────────────── */
.panel-handle-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 10px 6px;
  background: #1a1d23;
  border-bottom: 1px solid #21262d;
  user-select: none;
  flex-shrink: 0;
}
.panel-float .panel-handle-row { cursor: grab; }
.panel-float .panel-handle-row:active { cursor: grabbing; }

.panel-drag-handle { font-size: 12px; color: #484f58; flex-shrink: 0; }

.panel-title {
  flex: 1;
  font-size: 11px;
  color: #8b949e;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Mode toggle ─────────────────────────────────────────────── */
.mode-toggle { display: flex; gap: 2px; flex-shrink: 0; }

.mode-btn {
  background: none;
  border: 1px solid transparent;
  color: #484f58;
  font-size: 11px;
  padding: 1px 4px;
  border-radius: 3px;
  cursor: pointer;
  line-height: 1.2;
}
.mode-btn:hover { color: #8b949e; border-color: #30363d; }
.mode-btn.active { color: #58a6ff; border-color: #58a6ff33; background: #1a2840; }

.panel-close-btn {
  background: none;
  border: none;
  color: #484f58;
  font-size: 13px;
  cursor: pointer;
  padding: 0 2px;
  line-height: 1;
  flex-shrink: 0;
}
.panel-close-btn:hover { color: #f85149; }
</style>
