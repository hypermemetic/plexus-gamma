<template>
  <div class="binding-panel">
    <div class="bp-header">
      <span class="bp-type">{{ component.type }}</span>
      <span class="bp-id">{{ component.id.slice(0, 6) }}</span>
    </div>

    <!-- Geometry -->
    <section class="bp-section">
      <div class="bp-section-label">Position & Size</div>
      <div class="bp-row2">
        <div class="bp-field">
          <label>X</label>
          <input type="number" class="bp-input" :value="component.x" @change="emit('move', +(($event.target as HTMLInputElement).value), component.y)" />
        </div>
        <div class="bp-field">
          <label>Y</label>
          <input type="number" class="bp-input" :value="component.y" @change="emit('move', component.x, +(($event.target as HTMLInputElement).value))" />
        </div>
      </div>
      <div class="bp-row2">
        <div class="bp-field">
          <label>W</label>
          <input type="number" class="bp-input" :value="component.width"  @change="emit('resize', +(($event.target as HTMLInputElement).value), component.height)" />
        </div>
        <div class="bp-field">
          <label>H</label>
          <input type="number" class="bp-input" :value="component.height" @change="emit('resize', component.width, +(($event.target as HTMLInputElement).value))" />
        </div>
      </div>
    </section>

    <!-- Component-specific props -->
    <section class="bp-section">
      <div class="bp-section-label">Props</div>
      <template v-if="component.type === 'text' || component.type === 'heading'">
        <div class="bp-field">
          <label>Content</label>
          <textarea class="bp-textarea" :value="component.props.content as string" @input="emit('update-prop', 'content', ($event.target as HTMLTextAreaElement).value)" rows="3" />
        </div>
        <div class="bp-field">
          <label>Align</label>
          <select class="bp-input" :value="component.props.align as string" @change="emit('update-prop', 'align', ($event.target as HTMLSelectElement).value)">
            <option value="left">left</option>
            <option value="center">center</option>
            <option value="right">right</option>
          </select>
        </div>
        <div v-if="component.type === 'text'" class="bp-field">
          <label>Font size</label>
          <input type="number" class="bp-input" :value="component.props.fontSize as number" @change="emit('update-prop', 'fontSize', +(($event.target as HTMLInputElement).value))" />
        </div>
        <div v-if="component.type === 'heading'" class="bp-field">
          <label>Level</label>
          <select class="bp-input" :value="String(component.props.level)" @change="emit('update-prop', 'level', +($event.target as HTMLSelectElement).value)">
            <option value="1">H1</option>
            <option value="2">H2</option>
            <option value="3">H3</option>
          </select>
        </div>
      </template>

      <template v-else-if="component.type === 'button'">
        <div class="bp-field">
          <label>Label</label>
          <input class="bp-input" :value="component.props.label as string" @input="emit('update-prop', 'label', ($event.target as HTMLInputElement).value)" />
        </div>
        <div class="bp-field">
          <label>Variant</label>
          <select class="bp-input" :value="component.props.variant as string" @change="emit('update-prop', 'variant', ($event.target as HTMLSelectElement).value)">
            <option value="primary">primary</option>
            <option value="secondary">secondary</option>
            <option value="ghost">ghost</option>
          </select>
        </div>
      </template>

      <template v-else-if="component.type === 'list'">
        <div class="bp-field">
          <label>Label field</label>
          <input class="bp-input" :value="component.props.labelField as string" @input="emit('update-prop', 'labelField', ($event.target as HTMLInputElement).value)" placeholder="name" />
        </div>
        <div class="bp-field">
          <label>Empty text</label>
          <input class="bp-input" :value="component.props.emptyText as string" @input="emit('update-prop', 'emptyText', ($event.target as HTMLInputElement).value)" placeholder="No items" />
        </div>
      </template>

      <template v-else-if="component.type === 'form'">
        <div class="bp-field">
          <label>Submit label</label>
          <input class="bp-input" :value="component.props.submitLabel as string" @input="emit('update-prop', 'submitLabel', ($event.target as HTMLInputElement).value)" />
        </div>
      </template>
    </section>

    <!-- Method binding -->
    <section class="bp-section">
      <div class="bp-section-label">
        Method Binding
        <button v-if="component.binding" class="bp-clear-btn" @click="emit('set-binding', null)">clear</button>
      </div>

      <div v-if="component.binding" class="bp-current-binding">
        <span class="bp-binding-method">{{ component.binding.backend }}.{{ component.binding.method }}</span>
      </div>

      <!-- Method browser -->
      <div class="bp-method-browser">
        <input
          v-model="methodSearch"
          class="bp-input"
          placeholder="search methods…"
        />
        <div class="bp-method-list">
          <button
            v-for="entry in filteredMethods"
            :key="entry.fullPath"
            class="bp-method-row"
            :class="{ active: component.binding?.method === entry.fullPath }"
            @click="bindMethod(entry)"
          >
            <span class="bp-method-name">{{ entry.fullPath }}</span>
            <span v-if="entry.method.streaming" class="bp-method-tag">stream</span>
          </button>
          <div v-if="filteredMethods.length === 0" class="bp-method-empty">
            {{ methodIndex.length === 0 ? 'No backends connected' : 'No matches' }}
          </div>
        </div>
      </div>

      <!-- Static params (JSON) -->
      <div v-if="component.binding" class="bp-field">
        <label>Static params (JSON)</label>
        <textarea
          class="bp-textarea"
          :value="JSON.stringify(component.binding.staticParams ?? {}, null, 2)"
          rows="4"
          @change="onStaticParamsChange(($event.target as HTMLTextAreaElement).value)"
        />
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { ComponentInstance, MethodBinding } from './types'
import { useBackends } from '../../lib/useBackends'

const props = defineProps<{ component: ComponentInstance }>()
const emit = defineEmits<{
  'update-prop': [key: string, value: unknown]
  'set-binding': [binding: MethodBinding | null]
  'move':   [x: number, y: number]
  'resize': [w: number, h: number]
}>()

const { methodIndex } = useBackends()
const methodSearch = ref('')

const filteredMethods = computed(() => {
  const q = methodSearch.value.toLowerCase()
  return methodIndex.value.filter(e =>
    !q || e.fullPath.toLowerCase().includes(q) || e.backend.toLowerCase().includes(q)
  )
})

function bindMethod(entry: { backend: string; fullPath: string; method: { streaming: boolean } }) {
  emit('set-binding', {
    backend:      entry.backend,
    method:       entry.fullPath,
    staticParams: {},
  })
}

function onStaticParamsChange(raw: string) {
  if (!props.component.binding) return
  try {
    const parsed = JSON.parse(raw)
    emit('set-binding', { ...props.component.binding, staticParams: parsed })
  } catch { /* ignore invalid JSON */ }
}
</script>

<style scoped>
.binding-panel {
  padding: 0;
  font-size: 12px;
}

.bp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-3);
}
.bp-type { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--accent); }
.bp-id   { font-size: 9px; color: var(--text-dim); font-family: monospace; }

.bp-section {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.bp-section-label {
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--text-dim);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.bp-clear-btn {
  font-size: 9px;
  background: none;
  border: none;
  color: #f87171;
  cursor: pointer;
  padding: 0;
}
.bp-clear-btn:hover { text-decoration: underline; }

.bp-row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.bp-field { display: flex; flex-direction: column; gap: 2px; }
.bp-field label { font-size: 9px; color: var(--text-dim); }

.bp-input, .bp-textarea {
  background: var(--bg-3);
  border: 1px solid var(--border-2);
  border-radius: 3px;
  color: var(--text);
  font-size: 11px;
  padding: 4px 6px;
  outline: none;
  width: 100%;
  font-family: inherit;
}
.bp-input:focus, .bp-textarea:focus { border-color: var(--accent); }
.bp-textarea { resize: vertical; font-family: monospace; }

.bp-current-binding {
  background: var(--accent-bg);
  border-radius: 4px;
  padding: 5px 8px;
}
.bp-binding-method { font-family: monospace; font-size: 11px; color: var(--accent); }

.bp-method-browser { display: flex; flex-direction: column; gap: 4px; }
.bp-method-list {
  max-height: 180px;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: 4px;
  display: flex;
  flex-direction: column;
}
.bp-method-row {
  padding: 5px 8px;
  background: none;
  border: none;
  border-bottom: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 11px;
  text-align: left;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
}
.bp-method-row:last-child { border-bottom: none; }
.bp-method-row:hover { background: var(--bg-3); color: var(--text); }
.bp-method-row.active { background: var(--accent-bg); color: var(--accent); }
.bp-method-name { font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bp-method-tag { font-size: 9px; padding: 1px 4px; border-radius: 3px; background: rgba(47,129,247,0.15); color: #58a6ff; flex-shrink: 0; }
.bp-method-empty { padding: 10px; text-align: center; color: var(--text-dim); font-size: 11px; }
</style>
