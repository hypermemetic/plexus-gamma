<template>
  <div class="schema-field">
    <!-- enum → fuzzy select -->
    <template v-if="schema.enum">
      <FuzzySelect
        :options="schema.enum.map(String)"
        :model-value="modelValue !== undefined ? String(modelValue) : ''"
        @update:model-value="emit('update:modelValue', $event)"
      />
    </template>

    <!-- boolean → checkbox -->
    <template v-else-if="scalarType(schema) === 'boolean'">
      <label class="field-checkbox-label">
        <input
          type="checkbox"
          class="field-checkbox"
          :checked="!!modelValue"
          @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
        />
        <span class="field-checkbox-text">{{ name }}</span>
      </label>
    </template>

    <!-- integer / number → number input -->
    <template v-else-if="scalarType(schema) === 'integer' || scalarType(schema) === 'number'">
      <input
        type="number"
        class="field-input"
        :value="modelValue"
        :min="schema.minimum"
        :max="schema.maximum"
        :placeholder="schema.default !== undefined ? String(schema.default) : '0'"
        @input="emit('update:modelValue', Number(($event.target as HTMLInputElement).value))"
      />
    </template>

    <!-- string → text input -->
    <template v-else-if="scalarType(schema) === 'string'">
      <input
        type="text"
        class="field-input"
        :value="modelValue as string"
        :placeholder="schema.default !== undefined ? String(schema.default) : ''"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      />
    </template>

    <!-- object with properties → nested grid -->
    <template v-else-if="scalarType(schema) === 'object' && schema.properties">
      <div class="field-object">
        <div
          v-for="(propSchema, propName) in schema.properties"
          :key="propName"
          class="field-row"
        >
          <label class="field-label">
            {{ propName }}<span v-if="schema.required?.includes(propName)" class="field-required">*</span>
          </label>
          <SchemaField
            :name="propName"
            :schema="propSchema"
            :model-value="(modelValue as Record<string, unknown>)?.[propName]"
            @update:model-value="onNestedUpdate(propName, $event)"
          />
        </div>
      </div>
    </template>

    <!-- array → textarea (JSON paste) -->
    <template v-else-if="scalarType(schema) === 'array'">
      <textarea
        class="field-textarea"
        :value="modelValue !== undefined ? (typeof modelValue === 'string' ? modelValue : JSON.stringify(modelValue)) : ''"
        placeholder='["item1"]'
        spellcheck="false"
        rows="2"
        @input="onTextareaUpdate(($event.target as HTMLTextAreaElement).value)"
      />
    </template>

    <!-- anyOf / oneOf → branch selector -->
    <template v-else-if="schema.anyOf?.length || schema.oneOf?.length">
      <div class="field-union">
        <FuzzySelect
          class="field-union-select"
          :options="(schema.anyOf ?? schema.oneOf!).map((s, i) => branchLabel(s, i))"
          :model-value="branchLabel((schema.anyOf ?? schema.oneOf!)[selectedBranch]!, selectedBranch)"
          @update:model-value="val => selectedBranch = (schema.anyOf ?? schema.oneOf!).findIndex((s,i) => branchLabel(s,i) === val)"
        />
        <SchemaField
          :name="name"
          :schema="(schema.anyOf ?? schema.oneOf!)[selectedBranch]!"
          :model-value="modelValue"
          @update:model-value="emit('update:modelValue', $event)"
        />
      </div>
    </template>

    <!-- fallback → textarea with type hint -->
    <template v-else>
      <textarea
        class="field-textarea"
        :value="modelValue !== undefined ? (typeof modelValue === 'string' ? modelValue : JSON.stringify(modelValue, null, 2)) : ''"
        :placeholder="schema.type ? `(${schema.type})` : '(any)'"
        spellcheck="false"
        rows="2"
        @input="onTextareaUpdate(($event.target as HTMLTextAreaElement).value)"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import FuzzySelect from './FuzzySelect.vue'

export interface JsonSchema {
  type?: string | string[]
  title?: string
  properties?: Record<string, JsonSchema>
  required?: string[]
  enum?: unknown[]
  items?: JsonSchema
  description?: string
  minimum?: number
  maximum?: number
  default?: unknown
  oneOf?: JsonSchema[]
  anyOf?: JsonSchema[]
  $ref?: string
  $defs?: Record<string, JsonSchema>
}

const props = defineProps<{
  name: string
  schema: JsonSchema
  modelValue: unknown
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: unknown): void
}>()

// Normalize type: unwrap arrays and drop "null" → "boolean", "string", etc.
function scalarType(schema: JsonSchema): string | undefined {
  const t = schema.type
  if (!t) return undefined
  if (typeof t === 'string') return t === 'null' ? undefined : t
  const nonNull = t.filter(x => x !== 'null')
  return nonNull[0]
}

// Pre-fill from schema default on mount
onMounted(() => {
  if (props.modelValue === undefined && props.schema.default !== undefined) {
    emit('update:modelValue', props.schema.default)
  }
})

// anyOf/oneOf branch selector
const selectedBranch = ref(0)

function onNestedUpdate(key: string, value: unknown) {
  const current = (props.modelValue as Record<string, unknown>) ?? {}
  emit('update:modelValue', { ...current, [key]: value })
}

function onTextareaUpdate(text: string) {
  try {
    emit('update:modelValue', JSON.parse(text))
  } catch {
    emit('update:modelValue', text)
  }
}

function branchLabel(s: JsonSchema, i: number): string {
  if (s.title) return s.title
  if (s.enum && s.enum.length > 0) return String(s.enum[0])
  // schemars 1.x / Draft 2020-12: internally-tagged enums encode variant name
  // as properties.<tag_field>.const — e.g. { properties: { type: { const: "by_name" } } }
  if (s.properties) {
    for (const prop of Object.values(s.properties)) {
      if (prop && typeof prop === 'object' && 'const' in prop && prop.const !== undefined)
        return String(prop.const)
    }
  }
  if (s.type) return Array.isArray(s.type) ? s.type.filter(t => t !== 'null').join(' | ') : s.type
  return `option ${i + 1}`
}
</script>

<style scoped>
.schema-field { display: contents; }

.field-input, .field-select {
  background: var(--bg-2);
  border: 1px solid var(--border-2);
  border-radius: 4px;
  color: var(--text);
  font-family: inherit;
  font-size: 12px;
  padding: 4px 8px;
  outline: none;
  width: 100%;
  box-sizing: border-box;
}
.field-input:focus, .field-select:focus { border-color: var(--accent); }

.field-select { cursor: pointer; }
.field-select option { background: var(--bg-3); }

.field-textarea {
  width: 100%;
  background: var(--bg-2);
  border: 1px solid var(--border-2);
  border-radius: 4px;
  color: var(--text);
  font-family: inherit;
  font-size: 12px;
  padding: 4px 8px;
  resize: vertical;
  box-sizing: border-box;
  outline: none;
  line-height: 1.5;
}
.field-textarea:focus { border-color: var(--accent); }

.field-checkbox-label {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  color: var(--text);
  font-size: 12px;
}
.field-checkbox { cursor: pointer; accent-color: var(--accent); }
.field-checkbox-text { user-select: none; display: none; }

.field-object {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}

.field-row {
  display: grid;
  grid-template-columns: 110px 1fr;
  align-items: start;
  gap: 8px;
}

.field-label {
  font-size: 11px;
  color: var(--text-muted);
  padding-top: 5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.field-required { color: var(--red); margin-left: 2px; }

.field-union {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}

.field-union-select { margin-bottom: 2px; }
</style>
