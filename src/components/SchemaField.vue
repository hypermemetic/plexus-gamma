<template>
  <div class="schema-field">
    <!-- enum → select -->
    <template v-if="schema.enum">
      <select class="field-select" :value="modelValue" @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)">
        <option v-for="opt in schema.enum" :key="String(opt)" :value="opt">{{ opt }}</option>
      </select>
    </template>

    <!-- boolean → checkbox -->
    <template v-else-if="schema.type === 'boolean'">
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
    <template v-else-if="schema.type === 'integer' || schema.type === 'number'">
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
    <template v-else-if="schema.type === 'string'">
      <input
        type="text"
        class="field-input"
        :value="modelValue as string"
        :placeholder="schema.default !== undefined ? String(schema.default) : ''"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      />
    </template>

    <!-- object with properties → nested grid -->
    <template v-else-if="schema.type === 'object' && schema.properties">
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
    <template v-else-if="schema.type === 'array'">
      <textarea
        class="field-textarea"
        :value="modelValue !== undefined ? JSON.stringify(modelValue) : ''"
        placeholder='["item1"]'
        spellcheck="false"
        rows="2"
        @input="onTextareaUpdate(($event.target as HTMLTextAreaElement).value)"
      />
    </template>

    <!-- fallback → textarea with type hint -->
    <template v-else>
      <textarea
        class="field-textarea"
        :value="modelValue !== undefined ? JSON.stringify(modelValue, null, 2) : ''"
        :placeholder="schema.type ? `(${schema.type})` : '(any)'"
        spellcheck="false"
        rows="2"
        @input="onTextareaUpdate(($event.target as HTMLTextAreaElement).value)"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
export interface JsonSchema {
  type?: string
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
}

const props = defineProps<{
  name: string
  schema: JsonSchema
  modelValue: unknown
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: unknown): void
}>()

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
</script>

<style scoped>
.schema-field { display: contents; }

.field-input, .field-select {
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 4px;
  color: #c9d1d9;
  font-family: inherit;
  font-size: 12px;
  padding: 4px 8px;
  outline: none;
  width: 100%;
  box-sizing: border-box;
}
.field-input:focus, .field-select:focus { border-color: #58a6ff; }

.field-select { cursor: pointer; }
.field-select option { background: #161b22; }

.field-textarea {
  width: 100%;
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 4px;
  color: #c9d1d9;
  font-family: inherit;
  font-size: 12px;
  padding: 4px 8px;
  resize: vertical;
  box-sizing: border-box;
  outline: none;
  line-height: 1.5;
}
.field-textarea:focus { border-color: #58a6ff; }

.field-checkbox-label {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  color: #c9d1d9;
  font-size: 12px;
}
.field-checkbox { cursor: pointer; accent-color: #58a6ff; }
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
  color: #8b949e;
  padding-top: 5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.field-required { color: #f85149; margin-left: 2px; }
</style>
