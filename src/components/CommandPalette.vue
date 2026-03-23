<template>
  <Teleport to="body">
    <div v-if="open" class="palette-backdrop" @click.self="$emit('close')">
      <div class="palette-panel">
        <input
          ref="inputRef"
          v-model="query"
          class="palette-input"
          placeholder="Search methods…"
          spellcheck="false"
          @keydown="onKey"
        />
        <div class="palette-results" ref="listRef">
          <div
            v-for="(entry, i) in filtered"
            :key="entry.fullPath"
            class="palette-row"
            :class="{ active: i === activeIdx }"
            @click="select(entry)"
            @mouseenter="activeIdx = i"
          >
            <span class="palette-backend" :style="{ color: backendColor(entry.backend) }">[{{ entry.backend }}]</span>
            <span class="palette-path">{{ entry.fullPath }}</span>
            <span v-if="entry.method.description" class="palette-desc">{{ entry.method.description }}</span>
          </div>
          <div v-if="filtered.length === 0" class="palette-empty">No results</div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useContainedFocus } from '../lib/useContainedFocus'
import type { MethodSchema } from '../plexus-schema'

export interface MethodEntry {
  backend:   string
  fullPath:  string    // display path with backend prefix, e.g. "substrate.echo.say"
  callPath?: string    // wire-protocol method name (no backend prefix), e.g. "echo.say"
                       // if absent, callers must derive from path + method.name
  path:      string[]  // plugin path, e.g. ["echo"]
  method:    MethodSchema
}

const props = defineProps<{
  entries: MethodEntry[]
  open: boolean
}>()

const emit = defineEmits<{
  close: []
  select: [entry: MethodEntry]
}>()

const { focus } = useContainedFocus()
const query     = ref('')
const activeIdx = ref(0)
const inputRef  = ref<HTMLInputElement | null>(null)
const listRef   = ref<HTMLElement | null>(null)

const BACKEND_COLORS = ['var(--accent)', 'var(--green)', 'var(--yellow)', '#bc8cff', '#ff7b72', 'var(--accent-2)']
const colorMap = new Map<string, string>()
let colorIdx = 0

function backendColor(name: string): string {
  if (!colorMap.has(name)) colorMap.set(name, BACKEND_COLORS[colorIdx++ % BACKEND_COLORS.length]!)
  return colorMap.get(name)!
}

const filtered = computed(() => {
  const q = query.value.toLowerCase()
  if (!q) return props.entries.slice(0, 60)
  return props.entries
    .filter(e => e.fullPath.toLowerCase().includes(q))
    .sort((a, b) => {
      const ai = a.fullPath.toLowerCase().indexOf(q)
      const bi = b.fullPath.toLowerCase().indexOf(q)
      return ai - bi
    })
    .slice(0, 60)
})

watch(() => props.open, (v) => {
  if (v) {
    query.value = ''
    activeIdx.value = 0
    nextTick(() => focus(inputRef.value))
  }
})

watch(query, () => { activeIdx.value = 0 })

watch(activeIdx, (idx) => {
  nextTick(() => {
    const rows = listRef.value?.querySelectorAll<HTMLElement>('.palette-row')
    rows?.[idx]?.scrollIntoView({ block: 'nearest' })
  })
})

function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeIdx.value = Math.min(activeIdx.value + 1, filtered.value.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeIdx.value = Math.max(activeIdx.value - 1, 0)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const entry = filtered.value[activeIdx.value]
    if (entry) select(entry)
  } else if (e.key === 'Escape') {
    e.preventDefault()
    emit('close')
  }
}

function select(entry: MethodEntry) {
  emit('select', entry)
  emit('close')
}
</script>

<style scoped>
.palette-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 9999;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 80px;
  font-family: 'Berkeley Mono', 'Fira Code', 'Cascadia Code', ui-monospace, monospace;
}

.palette-panel {
  width: 560px;
  background: var(--bg-3);
  border: 1px solid var(--border-2);
  border-radius: 10px;
  overflow: hidden;
  box-shadow: var(--shadow-xl);
}

.palette-input {
  width: 100%;
  background: var(--bg-2);
  border: none;
  border-bottom: 1px solid var(--border-2);
  color: var(--text-2);
  font-family: inherit;
  font-size: 14px;
  padding: 12px 16px;
  outline: none;
  box-sizing: border-box;
}
.palette-input::placeholder { color: var(--text-dim); }

.palette-results {
  max-height: calc(8 * 40px);
  overflow-y: auto;
}

.palette-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  cursor: pointer;
  font-size: 12px;
  min-height: 40px;
  border-bottom: 1px solid var(--border);
}
.palette-row:last-child { border-bottom: none; }
.palette-row:hover,
.palette-row.active { background: var(--accent-bg); }

.palette-backend {
  font-size: 10px;
  font-weight: 600;
  flex-shrink: 0;
  letter-spacing: 0.03em;
}

.palette-path {
  color: var(--text-2);
  flex-shrink: 0;
}

.palette-desc {
  color: var(--text-dim);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.palette-empty {
  padding: 16px;
  color: var(--text-dim);
  font-size: 12px;
  text-align: center;
}
</style>
