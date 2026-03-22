<template>
  <div class="cp" :style="containerStyle">

    <!-- TEXT -->
    <template v-if="component.type === 'text'">
      <p class="cp-text" :style="textStyle">
        {{ component.props.content as string || 'Text block. Click to edit.' }}
      </p>
    </template>

    <!-- HEADING -->
    <template v-else-if="component.type === 'heading'">
      <component
        :is="'h' + (component.props.level ?? 1)"
        class="cp-heading"
        :class="'cp-h' + (component.props.level ?? 1)"
        :style="headingStyle"
      >{{ component.props.content as string || 'Page Heading' }}</component>
    </template>

    <!-- LIST -->
    <template v-else-if="component.type === 'list'">
      <div class="cp-list">
        <div class="cp-list-item">
          <span class="cp-list-dot" />
          <span>Item one</span>
        </div>
        <div class="cp-list-item">
          <span class="cp-list-dot" />
          <span>Item two</span>
        </div>
        <div class="cp-list-item cp-list-dim">
          <span class="cp-list-dot" />
          <span>Item three</span>
        </div>
        <div v-if="component.binding" class="cp-source">
          ↳ {{ component.binding.method }}
        </div>
      </div>
    </template>

    <!-- BUTTON -->
    <template v-else-if="component.type === 'button'">
      <div class="cp-btn-wrap">
        <button class="cp-btn" :class="'cp-btn-' + (component.props.variant ?? 'primary')">
          {{ component.props.label as string || 'Click me' }}
        </button>
      </div>
    </template>

    <!-- FORM -->
    <template v-else-if="component.type === 'form'">
      <div class="cp-form">
        <div class="cp-form-row">
          <label class="cp-label">Field</label>
          <div class="cp-input-mock" />
        </div>
        <div class="cp-form-row">
          <label class="cp-label">Field</label>
          <div class="cp-input-mock" />
        </div>
        <button class="cp-btn cp-btn-primary cp-form-submit">
          {{ component.props.submitLabel as string || 'Submit' }}
        </button>
        <div v-if="component.binding" class="cp-source">↳ {{ component.binding.method }}</div>
      </div>
    </template>

    <!-- STREAM -->
    <template v-else-if="component.type === 'stream'">
      <div class="cp-stream">
        <div class="cp-stream-line" style="width: 90%" />
        <div class="cp-stream-line" style="width: 75%" />
        <div class="cp-stream-line" style="width: 85%" />
        <div class="cp-stream-cursor">█</div>
        <div v-if="component.binding" class="cp-source">↳ {{ component.binding.method }}</div>
      </div>
    </template>

    <!-- JSON -->
    <template v-else-if="component.type === 'json'">
      <pre class="cp-json"><span class="cp-json-brace">{</span>
  <span class="cp-json-key">"type"</span>: <span class="cp-json-str">"example"</span>,
  <span class="cp-json-key">"value"</span>: <span class="cp-json-num">42</span>
<span class="cp-json-brace">}</span></pre>
    </template>

  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ComponentInstance } from './types'

const props = defineProps<{ component: ComponentInstance }>()

const containerStyle = computed(() => ({
  width: '100%',
  height: '100%',
}))

const textStyle = computed(() => ({
  fontSize:  ((props.component.props.fontSize as number) ?? 15) + 'px',
  textAlign: ((props.component.props.align   as string)  ?? 'left') as 'left' | 'center' | 'right',
  color:      (props.component.props.color   as string)  ?? 'inherit',
}))

const headingStyle = computed(() => ({
  textAlign: ((props.component.props.align as string) ?? 'left') as 'left' | 'center' | 'right',
  color:      (props.component.props.color as string) ?? 'inherit',
}))
</script>

<style scoped>
.cp {
  font-family: system-ui, -apple-system, sans-serif;
  color: #1a1a2e;
  padding: 8px 12px;
  box-sizing: border-box;
}

/* Text */
.cp-text {
  margin: 0;
  line-height: 1.65;
}

/* Headings */
.cp-heading { margin: 0; font-weight: 700; line-height: 1.2; color: #111; }
.cp-h1 { font-size: 2.25rem; }
.cp-h2 { font-size: 1.6rem; }
.cp-h3 { font-size: 1.25rem; }

/* List */
.cp-list { display: flex; flex-direction: column; gap: 8px; }
.cp-list-item {
  display: flex; align-items: center; gap: 10px;
  font-size: 14px; color: #374151;
  padding: 8px 12px;
  background: #f9fafb;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
}
.cp-list-dim { opacity: 0.45; }
.cp-list-dot { width: 6px; height: 6px; border-radius: 50%; background: #6b7280; flex-shrink: 0; }

/* Button */
.cp-btn-wrap { display: flex; align-items: center; justify-content: flex-start; height: 100%; padding: 4px 0; }
.cp-btn {
  border: none; border-radius: 6px; padding: 10px 20px; font-size: 14px;
  font-weight: 600; cursor: pointer; font-family: inherit; letter-spacing: 0.01em;
}
.cp-btn-primary   { background: #2563eb; color: #fff; }
.cp-btn-secondary { background: #f3f4f6; color: #374151; border: 1px solid #d1d5db; }
.cp-btn-ghost     { background: transparent; color: #2563eb; border: 1px solid #2563eb; }

/* Form */
.cp-form { display: flex; flex-direction: column; gap: 10px; }
.cp-form-row { display: flex; flex-direction: column; gap: 4px; }
.cp-label { font-size: 12px; font-weight: 500; color: #6b7280; }
.cp-input-mock {
  height: 34px; background: #fff; border: 1px solid #d1d5db; border-radius: 6px;
}
.cp-form-submit { align-self: flex-start; margin-top: 4px; }

/* Stream */
.cp-stream { display: flex; flex-direction: column; gap: 8px; padding: 4px 0; }
.cp-stream-line { height: 12px; background: #e5e7eb; border-radius: 4px; }
.cp-stream-cursor { font-size: 14px; color: #374151; animation: blink 1s step-end infinite; }
@keyframes blink { 0%, 100% { opacity: 1 } 50% { opacity: 0 } }

/* JSON */
.cp-json {
  margin: 0; font-size: 12px; line-height: 1.6;
  background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px;
  padding: 8px 12px; overflow: auto; height: 100%; box-sizing: border-box;
  color: #334155;
}
.cp-json-brace { color: #64748b; }
.cp-json-key   { color: #7c3aed; }
.cp-json-str   { color: #059669; }
.cp-json-num   { color: #d97706; }

/* Binding source label */
.cp-source {
  font-size: 10px; color: #9ca3af; font-family: monospace;
  padding-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
</style>
