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

interface PropEntry { schema: JsonSchema; required: boolean }

function objectProps(schema: JsonSchema): Record<string, PropEntry> {
  const result: Record<string, PropEntry> = {}
  if (!schema.properties) return result
  for (const [k, v] of Object.entries(schema.properties)) {
    result[k] = { schema: v, required: schema.required?.includes(k) ?? false }
  }
  return result
}

function isScalar(schema: JsonSchema): boolean {
  return ['string', 'number', 'integer', 'boolean'].includes(schema.type ?? '')
}

// Returns null if no extra detail needed (inline), or entries for expansion
const expanded = computed<null | [string, JsonSchema][]>(() => {
  const schema = s.value
  if (!schema) return null
  if (schema.type === 'object' && schema.properties) {
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

  const type = schema.type
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
        return `${k}${opt}: ${(v as JsonSchema).type ?? 'any'}`
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
  constructor(private schema: JsonSchema) {}
  inline(): string {
    const s = this.schema
    if (!s) return 'any'
    if (s.enum) return s.enum.map(v => JSON.stringify(v)).join(' | ')
    const t = s.type
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
.type-number  { color: #79c0ff; }
.type-bool    { color: #d2a8ff; }
.type-enum    { color: #f0c040; }
.type-array   { color: #79c0ff; }
.type-object  { color: #8b949e; }

.expand-btn {
  background: none;
  border: none;
  color: #484f58;
  cursor: pointer;
  font-size: 9px;
  padding: 0 2px;
  line-height: 1;
  vertical-align: middle;
}
.expand-btn:hover { color: #8b949e; }

.type-expanded {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 4px;
  padding: 6px 8px;
  background: #0d1117;
  border: 1px solid #21262d;
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
  color: #8b949e;
  min-width: 80px;
  flex-shrink: 0;
}
</style>
