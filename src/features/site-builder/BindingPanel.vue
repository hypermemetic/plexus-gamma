<template>
  <div class="binding-panel">
    <div class="bp-header">
      <span class="bp-type">{{ element.type }}</span>
      <span class="bp-id">{{ element.id.slice(0, 6) }}</span>
    </div>

    <!-- Element-specific props -->
    <section class="bp-section">
      <div class="bp-section-label">Props</div>

      <template v-if="element.type === 'text' || element.type === 'heading'">
        <div class="bp-field">
          <label>Content</label>
          <textarea
            class="bp-textarea"
            :value="element.props.content as string"
            rows="3"
            @input="emit('update-prop', 'content', ($event.target as HTMLTextAreaElement).value)"
          />
        </div>
        <div class="bp-field">
          <label>Align</label>
          <select class="bp-input" :value="element.props.align as string" @change="emit('update-prop', 'align', ($event.target as HTMLSelectElement).value)">
            <option value="left">left</option>
            <option value="center">center</option>
            <option value="right">right</option>
          </select>
        </div>
        <div v-if="element.type === 'text'" class="bp-field">
          <label>Font size (px)</label>
          <input type="number" class="bp-input" :value="element.props.fontSize as number"
            @change="emit('update-prop', 'fontSize', +(($event.target as HTMLInputElement).value))" />
        </div>
        <div v-if="element.type === 'heading'" class="bp-field">
          <label>Level</label>
          <select class="bp-input" :value="String(element.props.level)" @change="emit('update-prop', 'level', +($event.target as HTMLSelectElement).value)">
            <option value="1">H1</option>
            <option value="2">H2</option>
            <option value="3">H3</option>
          </select>
        </div>
      </template>

      <template v-else-if="element.type === 'button'">
        <div class="bp-field">
          <label>Label</label>
          <input class="bp-input" :value="element.props.label as string"
            @input="emit('update-prop', 'label', ($event.target as HTMLInputElement).value)" />
        </div>
        <div class="bp-field">
          <label>Variant</label>
          <select class="bp-input" :value="element.props.variant as string" @change="emit('update-prop', 'variant', ($event.target as HTMLSelectElement).value)">
            <option value="primary">primary</option>
            <option value="secondary">secondary</option>
            <option value="ghost">ghost</option>
          </select>
        </div>
      </template>

      <template v-else-if="element.type === 'list'">
        <div class="bp-field">
          <label>Label field</label>
          <input class="bp-input" :value="element.props.labelField as string" placeholder="name"
            @input="emit('update-prop', 'labelField', ($event.target as HTMLInputElement).value)" />
        </div>
        <div class="bp-field">
          <label>Empty text</label>
          <input class="bp-input" :value="element.props.emptyText as string" placeholder="No items"
            @input="emit('update-prop', 'emptyText', ($event.target as HTMLInputElement).value)" />
        </div>
      </template>

      <template v-else-if="element.type === 'form'">
        <div class="bp-field">
          <label>Submit label</label>
          <input class="bp-input" :value="element.props.submitLabel as string"
            @input="emit('update-prop', 'submitLabel', ($event.target as HTMLInputElement).value)" />
        </div>
      </template>

      <template v-else-if="element.type === 'spacer'">
        <div class="bp-field">
          <label>Height (px)</label>
          <input type="number" class="bp-input" :value="element.props.height as number"
            @change="emit('update-prop', 'height', +(($event.target as HTMLInputElement).value))" />
        </div>
      </template>

      <template v-else-if="element.type === 'divider'">
        <div class="bp-field">
          <label>Thickness (px)</label>
          <input type="number" class="bp-input" :value="element.props.thickness as number"
            @change="emit('update-prop', 'thickness', +(($event.target as HTMLInputElement).value))" />
        </div>
      </template>
    </section>

    <!-- Method binding -->
    <section class="bp-section">
      <div class="bp-section-label">
        Method Binding
        <button v-if="element.binding" class="bp-clear-btn" @click="emit('set-binding', null)">clear</button>
      </div>

      <div v-if="element.binding" class="bp-current-binding">
        <span class="bp-binding-method">{{ element.binding.backend }}.{{ element.binding.method }}</span>
      </div>

      <div class="bp-method-browser">
        <input v-model="methodSearch" class="bp-input" placeholder="search methods…" />
        <div class="bp-method-list">
          <button
            v-for="entry in filteredMethods"
            :key="entry.fullPath"
            class="bp-method-row"
            :class="{ active: element.binding?.backend === entry.backend && element.binding?.method === callPath(entry) }"
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

      <div v-if="element.binding" class="bp-field">
        <label>Static params (JSON)</label>
        <textarea
          class="bp-textarea"
          :value="JSON.stringify(element.binding.staticParams ?? {}, null, 2)"
          rows="4"
          @change="onStaticParamsChange(($event.target as HTMLTextAreaElement).value)"
        />
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { SiteElement, MethodBinding } from './types'
import { useBackends } from '../../lib/useBackends'
import type { MethodEntry } from '../../components/CommandPalette.vue'

const props = defineProps<{ element: SiteElement }>()
const emit = defineEmits<{
  'update-prop': [key: string, value: unknown]
  'set-binding': [binding: MethodBinding | null]
}>()

const { methodIndex } = useBackends()
const methodSearch = ref('')

const filteredMethods = computed((): MethodEntry[] => {
  const q = methodSearch.value.toLowerCase()
  return methodIndex.value.filter(e =>
    !q || e.fullPath.toLowerCase().includes(q)
  )
})

// callPath = the actual RPC method name sent over the wire (no backend prefix)
// e.g. entry.fullPath = "substrate.echo.once" → callPath = "echo.once"
function callPath(entry: MethodEntry): string {
  return entry.path.length === 0
    ? entry.method.name
    : `${entry.path.join('.')}.${entry.method.name}`
}

function bindMethod(entry: MethodEntry) {
  emit('set-binding', { backend: entry.backend, method: callPath(entry), staticParams: {} })
}

function onStaticParamsChange(raw: string) {
  if (!props.element.binding) return
  try {
    const parsed = JSON.parse(raw)
    emit('set-binding', { ...props.element.binding, staticParams: parsed })
  } catch { /* ignore invalid JSON */ }
}
</script>

<style scoped>
.binding-panel { padding: 0; font-size: 12px; }

.bp-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 12px; border-bottom: 1px solid var(--border); background: var(--bg-3);
}
.bp-type { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--accent); }
.bp-id   { font-size: 9px; color: var(--text-dim); font-family: monospace; }

.bp-section {
  padding: 8px 12px; border-bottom: 1px solid var(--border);
  display: flex; flex-direction: column; gap: 6px;
}
.bp-section-label {
  font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.07em;
  color: var(--text-dim); display: flex; align-items: center; justify-content: space-between;
}
.bp-clear-btn {
  font-size: 9px; background: none; border: none; color: #f87171; cursor: pointer; padding: 0;
}
.bp-clear-btn:hover { text-decoration: underline; }

.bp-field { display: flex; flex-direction: column; gap: 2px; }
.bp-field label { font-size: 9px; color: var(--text-dim); }

.bp-input, .bp-textarea {
  background: var(--bg-3); border: 1px solid var(--border-2); border-radius: 3px;
  color: var(--text); font-size: 11px; padding: 4px 6px; outline: none; width: 100%; font-family: inherit;
}
.bp-input:focus, .bp-textarea:focus { border-color: var(--accent); }
.bp-textarea { resize: vertical; font-family: monospace; }

.bp-current-binding { background: var(--accent-bg); border-radius: 4px; padding: 5px 8px; }
.bp-binding-method { font-family: monospace; font-size: 11px; color: var(--accent); }

.bp-method-browser { display: flex; flex-direction: column; gap: 4px; }
.bp-method-list {
  max-height: 160px; overflow-y: auto; border: 1px solid var(--border);
  border-radius: 4px; display: flex; flex-direction: column;
}
.bp-method-row {
  padding: 5px 8px; background: none; border: none; border-bottom: 1px solid var(--border);
  color: var(--text-muted); font-size: 11px; text-align: left; cursor: pointer;
  display: flex; align-items: center; justify-content: space-between; gap: 4px;
}
.bp-method-row:last-child { border-bottom: none; }
.bp-method-row:hover { background: var(--bg-3); color: var(--text); }
.bp-method-row.active { background: var(--accent-bg); color: var(--accent); }
.bp-method-name { font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bp-method-tag { font-size: 9px; padding: 1px 4px; border-radius: 3px; background: rgba(47,129,247,0.15); color: #58a6ff; flex-shrink: 0; }
.bp-method-empty { padding: 10px; text-align: center; color: var(--text-dim); font-size: 11px; }
</style>
