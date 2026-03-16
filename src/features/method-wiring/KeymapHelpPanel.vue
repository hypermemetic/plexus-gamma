<template>
  <div v-if="open" class="km-overlay" @mousedown.stop @click.stop @keydown.stop>
    <div class="km-panel">
      <div class="km-chrome">
        <span class="km-title">Keyboard Shortcuts</span>
        <button class="km-close" @click="emit('close')">✕</button>
      </div>
      <div class="km-body">
        <div
          v-for="id in (Object.keys(defs) as ActionId[])"
          :key="id"
          class="km-row"
          :class="{ 'km-row-capturing': capturing === id }"
        >
          <span class="km-label">{{ defs[id].label }}</span>
          <div class="km-keys">
            <template v-if="capturing === id">
              <span class="km-key km-key-capturing">press keys…</span>
              <button class="km-cancel-btn" @click="stopCapture">cancel</button>
            </template>
            <template v-else>
              <span
                v-for="combo in currentKeysFor(id)"
                :key="combo"
                class="km-key"
              >{{ combo }}</span>
              <button class="km-rebind-btn" @click="startCapture(id)" title="Rebind">✎</button>
              <button
                v-if="overrides[id]"
                class="km-reset-btn"
                @click="emit('reset', id)"
                title="Reset to default"
              >↺</button>
            </template>
          </div>
        </div>
      </div>
      <div class="km-footer">
        Click ✎ to rebind · ↺ to reset to default · Esc to close
      </div>
    </div>
  </div>
</template>

<script setup lang="ts" generic="ActionId extends string">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { ActionDef, KeyMap } from './useKeymap'
import { normalizeCombo } from './useKeymap'

const props = defineProps<{
  open: boolean
  defs: Record<ActionId, ActionDef>
  currentKeys: KeyMap<ActionId>
}>()

const emit = defineEmits<{
  close: []
  setKeys: [id: ActionId, combos: string[]]
  reset: [id: ActionId]
}>()

const capturing = ref<ActionId | null>(null)

// Which actions have user overrides (i.e. key exists in currentKeys)
const overrides = computed(() => {
  const o: Partial<Record<ActionId, true>> = {}
  for (const id of Object.keys(props.currentKeys) as ActionId[]) {
    o[id] = true
  }
  return o
})

function currentKeysFor(id: ActionId): string[] {
  return props.currentKeys[id] ?? props.defs[id]?.defaultKeys ?? []
}

function startCapture(id: ActionId) {
  capturing.value = id
}

function stopCapture() {
  capturing.value = null
}

function onKeyDown(e: KeyboardEvent) {
  if (!capturing.value) return
  // Escape cancels capture
  if (e.key === 'Escape') { e.stopPropagation(); stopCapture(); return }
  // Ignore bare modifier presses
  if (['Control', 'Meta', 'Alt', 'Shift'].includes(e.key)) return
  e.preventDefault()
  e.stopPropagation()
  const combo = normalizeCombo(e)
  emit('setKeys', capturing.value, [combo])
  stopCapture()
}

onMounted(() => document.addEventListener('keydown', onKeyDown, true))
onUnmounted(() => document.removeEventListener('keydown', onKeyDown, true))
</script>

<style scoped>
.km-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 40px 24px;
  background: rgba(8, 10, 14, 0.7);
  backdrop-filter: blur(2px);
  z-index: 600;
  overflow: auto;
}

.km-panel {
  background: var(--bg-3);
  border: 1px solid var(--border-2);
  border-radius: 10px;
  box-shadow: 0 16px 48px rgba(0,0,0,0.7);
  width: 100%;
  max-width: 520px;
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 100px);
  overflow: hidden;
}

.km-chrome {
  display: flex;
  align-items: center;
  padding: 8px 14px 8px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-3);
  border-radius: 10px 10px 0 0;
  flex-shrink: 0;
}

.km-title {
  flex: 1;
  font-size: 11px;
  color: var(--text-muted);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.km-close {
  background: none;
  border: none;
  color: var(--text-dim);
  font-size: 13px;
  cursor: pointer;
  padding: 0 2px;
  line-height: 1;
}
.km-close:hover { color: var(--red); }

.km-body {
  overflow-y: auto;
  flex: 1;
  padding: 8px 0;
}

.km-row {
  display: flex;
  align-items: center;
  padding: 6px 16px;
  gap: 12px;
  border-bottom: 1px solid var(--bg-3);
}
.km-row:last-child { border-bottom: none; }
.km-row-capturing { background: var(--bg-2); }

.km-label {
  flex: 1;
  font-size: 12px;
  color: var(--text);
  font-family: 'Berkeley Mono', 'Fira Code', ui-monospace, monospace;
}

.km-keys {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.km-key {
  background: var(--border);
  border: 1px solid var(--border-2);
  border-radius: 4px;
  color: var(--text-muted);
  font-family: 'Berkeley Mono', 'Fira Code', ui-monospace, monospace;
  font-size: 10px;
  padding: 2px 6px;
  white-space: nowrap;
}
.km-key-capturing {
  background: #0d1a2d;
  border-color: var(--accent);
  color: var(--accent);
  animation: km-blink 1s step-end infinite;
}
@keyframes km-blink {
  50% { opacity: 0.4; }
}

.km-rebind-btn,
.km-cancel-btn,
.km-reset-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 11px;
  padding: 2px 4px;
  border-radius: 3px;
  line-height: 1;
}
.km-rebind-btn { color: var(--text-dim); }
.km-rebind-btn:hover { color: var(--accent); background: var(--accent-bg); }
.km-cancel-btn { color: var(--red); font-size: 10px; }
.km-cancel-btn:hover { background: #2a0e0e; }
.km-reset-btn { color: var(--text-dim); }
.km-reset-btn:hover { color: var(--yellow); background: #2a2000; }

.km-footer {
  padding: 8px 16px;
  font-size: 10px;
  color: var(--text-dim);
  border-top: 1px solid var(--border);
  flex-shrink: 0;
  letter-spacing: 0.03em;
}
</style>
