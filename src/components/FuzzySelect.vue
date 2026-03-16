<template>
  <div class="fuzzy-select">
    <input
      ref="inputEl"
      class="fuzzy-input"
      :value="inputVal"
      :placeholder="placeholder ?? modelValue ?? ''"
      autocomplete="off"
      spellcheck="false"
      @focus="onFocus"
      @input="onInput"
      @keydown="onKeyDown"
      @blur="onBlur"
    />
    <div v-if="open && filtered.length" class="fuzzy-dropdown">
      <div
        v-for="(opt, i) in filtered"
        :key="opt"
        class="fuzzy-option"
        :class="{ active: i === activeIdx }"
        @mousedown.prevent="select(opt)"
        @mousemove="activeIdx = i"
      >{{ opt }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useContainedFocus } from '../lib/useContainedFocus'

const props = defineProps<{
  options: string[]
  modelValue: string
  placeholder?: string
}>()

const emit = defineEmits<{ 'update:modelValue': [string] }>()

const { focus: containedFocus } = useContainedFocus()
const inputEl = ref<HTMLInputElement | null>(null)
const open     = ref(false)
const query    = ref('')
const activeIdx = ref(0)

// Show query while typing, else show current value
const inputVal = computed(() => open.value ? query.value : props.modelValue)

function fuzzyMatch(option: string, q: string): boolean {
  if (!q) return true
  const o = option.toLowerCase()
  const s = q.toLowerCase()
  let oi = 0
  for (let si = 0; si < s.length; si++) {
    oi = o.indexOf(s[si]!, oi)
    if (oi === -1) return false
    oi++
  }
  return true
}

const filtered = computed(() =>
  props.options.filter(o => fuzzyMatch(o, query.value))
)

watch(filtered, () => { activeIdx.value = 0 })

function onFocus() {
  query.value = ''
  open.value = true
  activeIdx.value = 0
}

function onInput(e: Event) {
  query.value = (e.target as HTMLInputElement).value
}

function onBlur() {
  // Small delay so mousedown.prevent on option can fire first
  setTimeout(() => { open.value = false }, 120)
}

function select(opt: string) {
  emit('update:modelValue', opt)
  open.value = false
  query.value = ''
}

function onKeyDown(e: KeyboardEvent) {
  if (!open.value) { open.value = true; return }
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeIdx.value = Math.min(activeIdx.value + 1, filtered.value.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeIdx.value = Math.max(activeIdx.value - 1, 0)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const opt = filtered.value[activeIdx.value]
    if (opt != null) select(opt)
  } else if (e.key === 'Escape') {
    open.value = false
  }
}

defineExpose({ focus: () => containedFocus(inputEl.value) })
</script>

<style scoped>
.fuzzy-select {
  position: relative;
  width: 100%;
}

.fuzzy-input {
  width: 100%;
  box-sizing: border-box;
  background: var(--bg-2);
  border: 1px solid var(--border-2);
  border-radius: 4px;
  color: var(--text);
  font-family: inherit;
  font-size: 12px;
  padding: 4px 8px;
  outline: none;
}
.fuzzy-input:focus { border-color: var(--accent); }

.fuzzy-dropdown {
  position: absolute;
  top: calc(100% + 2px);
  left: 0;
  right: 0;
  background: var(--bg-3);
  border: 1px solid var(--border-2);
  border-radius: 4px;
  max-height: 160px;
  overflow-y: auto;
  z-index: 500;
  box-shadow: 0 4px 16px rgba(0,0,0,0.5);
}

.fuzzy-option {
  padding: 5px 10px;
  font-size: 12px;
  color: var(--text);
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.fuzzy-option:hover,
.fuzzy-option.active { background: #1f2937; color: var(--accent); }
</style>
