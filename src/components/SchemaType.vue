<template>
  <span v-if="display" class="schema-type" :class="typeClass">
    <template v-if="expanded === null">
      <!-- simple inline display -->
      <span class="type-text">{{ display }}</span>
    </template>
    <template v-else>
      <!-- collapsible display -->
      <span class="type-text">{{ display }}</span>
      <button class="expand-btn" @click.stop="open = !open">{{ open ? '▴' : '▾' }}</button>
      <div v-if="open" class="type-expanded">
        <div
          v-for="([k, v], i) in expandedProps"
          :key="i"
          class="type-prop-row"
        >
          <span class="type-prop-key">{{ k }}</span>
          <SchemaType :schema="v" />
        </div>
      </div>
    </template>
  </span>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { JsonSchema } from './SchemaField.vue'

const props = defineProps<{
  schema: unknown
}>()

const open = ref(false)

const s = computed<JsonSchema | null>(() => {
  if (!props.schema || typeof props.schema !== 'object') return null
  return props.schema as JsonSchema
})

function primitiveName(type: string): string {
  return type
}

function enumDisplay(values: unknown[]): { text: string; clipped: boolean } {
  const strs = values.map(v => JSON.stringify(v))
  if (strs.length <= 3) return { text: strs.join(' | '), clipped: false }
  return { text: `${strs.slice(0, 3).join(' | ')} | … (${values.length})`, clipped: true }
}


function scalarType(schema: JsonSchema): string | undefined {
  const t = schema.type
  if (!t) return undefined
  if (typeof t === 'string') return t === 'null' ? undefined : t
  return t.filter(x => x !== 'null')[0]
}

function isScalar(schema: JsonSchema): boolean {
  return ['string', 'number', 'integer', 'boolean'].includes(scalarType(schema) ?? '')
}

// Returns null if no extra detail needed (inline), or entries for expansion
const expanded = computed<null | [string, JsonSchema][]>(() => {
  const schema = s.value
  if (!schema) return null
  if (scalarType(schema) === 'object' && schema.properties) {
    const entries = Object.entries(schema.properties)
    const allScalar = entries.every(([, v]) => isScalar(v as JsonSchema))
    if (allScalar && entries.length <= 4) return null // inline
    return entries.map(([k, v]) => [k, v as JsonSchema])
  }
  return null
})

const expandedProps = computed<[string, JsonSchema][]>(() => expanded.value ?? [])

const display = computed<string>(() => {
  const schema = s.value
  if (!schema) return ''

  if (schema.enum) {
    return enumDisplay(schema.enum).text
  }

  const type = scalarType(schema)
  if (!type) return ''

  if (type === 'string' || type === 'number' || type === 'integer' || type === 'boolean') {
    return primitiveName(type)
  }

  if (type === 'array') {
    if (schema.items) {
      const inner = new SchemaTypeDisplay(schema.items as JsonSchema)
      return `${inner.inline()}[]`
    }
    return 'any[]'
  }

  if (type === 'object' && schema.properties) {
    const entries = Object.entries(schema.properties)
    const allScalar = entries.every(([, v]) => isScalar(v as JsonSchema))
    if (allScalar && entries.length <= 4) {
      // inline
      const req = schema.required ?? []
      const parts = entries.map(([k, v]) => {
        const opt = !req.includes(k) ? '?' : ''
        return `${k}${opt}: ${scalarType(v as JsonSchema) ?? 'any'}`
      })
      return `{ ${parts.join(', ')} }`
    }
    return `{ ${entries.length} fields }`
  }

  return type
})

const typeClass = computed(() => {
  const schema = s.value
  if (!schema) return ''
  const t = schema.type
  if (schema.enum) return 'type-enum'
  if (t === 'string') return 'type-string'
  if (t === 'number' || t === 'integer') return 'type-number'
  if (t === 'boolean') return 'type-bool'
  if (t === 'array') return 'type-array'
  if (t === 'object') return 'type-object'
  return ''
})

// Helper class for recursive inline display (avoids component recursion for simple cases)
class SchemaTypeDisplay {
  schema: JsonSchema
  constructor(schema: JsonSchema) { this.schema = schema }
  inline(): string {
    const s = this.schema
    if (!s) return 'any'
    if (s.enum) return s.enum.map(v => JSON.stringify(v)).join(' | ')
    const t = scalarType(s)
    if (!t) return 'any'
    if (t === 'array') {
      if (s.items) return `${new SchemaTypeDisplay(s.items as JsonSchema).inline()}[]`
      return 'any[]'
    }
    if (t === 'object') return s.properties ? `{ ${Object.keys(s.properties).length} fields }` : 'object'
    return t
  }
}
</script>

<style scoped>
.schema-type {
  font-family: inherit;
  font-size: 11px;
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  flex-wrap: wrap;
}

.type-text { }

.type-string  { color: #7ee787; }
.type-number  { color: var(--accent-2); }
.type-bool    { color: #d2a8ff; }
.type-enum    { color: #f0c040; }
.type-array   { color: var(--accent-2); }
.type-object  { color: var(--text-muted); }

.expand-btn {
  background: none;
  border: none;
  color: var(--text-dim);
  cursor: pointer;
  font-size: 9px;
  padding: 0 2px;
  line-height: 1;
  vertical-align: middle;
}
.expand-btn:hover { color: var(--text-muted); }

.type-expanded {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 4px;
  padding: 6px 8px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 4px;
  width: 100%;
}

.type-prop-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
}

.type-prop-key {
  color: var(--text-muted);
  min-width: 80px;
  flex-shrink: 0;
}
</style>
