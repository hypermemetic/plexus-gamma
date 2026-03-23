<template>
  <div class="ep">

    <!-- HEADING -->
    <template v-if="element.type === 'heading'">
      <component
        :is="'h' + (element.props.level ?? 2)"
        class="ep-heading"
        :class="'ep-h' + (element.props.level ?? 2)"
        :style="{ textAlign: (element.props.align as string) ?? 'left', color: (element.props.color as string) ?? 'inherit' }"
      >{{ element.props.content as string || 'Section Heading' }}</component>
    </template>

    <!-- TEXT -->
    <template v-else-if="element.type === 'text'">
      <p class="ep-text" :style="textStyle">
        {{ element.props.content as string || 'Your text here.' }}
      </p>
    </template>

    <!-- LIST -->
    <template v-else-if="element.type === 'list'">
      <div class="ep-list">
        <div v-for="n in 3" :key="n" class="ep-list-item" :class="{ 'ep-dim': n === 3 }">
          <span class="ep-list-dot" />
          <span>{{ n === 1 ? 'First item' : n === 2 ? 'Second item' : 'Third item…' }}</span>
        </div>
        <div v-if="element.binding" class="ep-source">↳ {{ element.binding.method }}</div>
      </div>
    </template>

    <!-- BUTTON -->
    <template v-else-if="element.type === 'button'">
      <div class="ep-btn-row">
        <button class="ep-btn" :class="'ep-btn-' + (element.props.variant ?? 'primary')">
          {{ element.props.label as string || 'Click me' }}
        </button>
      </div>
    </template>

    <!-- FORM -->
    <template v-else-if="element.type === 'form'">
      <div class="ep-form">
        <div v-for="n in 2" :key="n" class="ep-form-row">
          <label class="ep-label">Field {{ n }}</label>
          <div class="ep-input-mock" />
        </div>
        <button class="ep-btn ep-btn-primary ep-form-submit">
          {{ element.props.submitLabel as string || 'Submit' }}
        </button>
        <div v-if="element.binding" class="ep-source">↳ {{ element.binding.method }}</div>
      </div>
    </template>

    <!-- STREAM -->
    <template v-else-if="element.type === 'stream'">
      <div class="ep-stream">
        <div class="ep-stream-line" style="width: 90%" />
        <div class="ep-stream-line" style="width: 72%" />
        <div class="ep-stream-line" style="width: 85%" />
        <span class="ep-cursor">█</span>
        <div v-if="element.binding" class="ep-source">↳ {{ element.binding.method }}</div>
      </div>
    </template>

    <!-- JSON -->
    <template v-else-if="element.type === 'json'">
      <pre class="ep-json"><span class="ep-json-b">{</span>
  <span class="ep-json-k">"type"</span>: <span class="ep-json-s">"example"</span>,
  <span class="ep-json-k">"value"</span>: <span class="ep-json-n">42</span>
<span class="ep-json-b">}</span></pre>
    </template>

    <!-- DIVIDER -->
    <template v-else-if="element.type === 'divider'">
      <hr class="ep-divider" :style="{ borderColor: (element.props.color as string) ?? '#e5e7eb', borderTopWidth: ((element.props.thickness as number) ?? 1) + 'px', margin: ((element.props.margin as number) ?? 8) + 'px 0' }" />
    </template>

    <!-- SPACER -->
    <template v-else-if="element.type === 'spacer'">
      <div class="ep-spacer" :style="{ height: ((element.props.height as number) ?? 48) + 'px' }">
        <span class="ep-spacer-label">↕ {{ element.props.height ?? 48 }}px</span>
      </div>
    </template>

  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { SiteElement } from './types'

const props = defineProps<{ element: SiteElement }>()

const textStyle = computed(() => ({
  fontSize:  ((props.element.props.fontSize as number) ?? 16) + 'px',
  textAlign: ((props.element.props.align   as string)  ?? 'left') as 'left' | 'center' | 'right',
  color:      (props.element.props.color   as string)  ?? 'inherit',
}))
</script>

<style scoped>
.ep {
  font-family: system-ui, -apple-system, sans-serif;
  color: #111827;
  width: 100%;
}

/* Heading */
.ep-heading { margin: 0; font-weight: 700; line-height: 1.25; color: #111; }
.ep-h1 { font-size: 2.25rem; }
.ep-h2 { font-size: 1.6rem; }
.ep-h3 { font-size: 1.25rem; }

/* Text */
.ep-text { margin: 0; line-height: 1.65; color: #374151; }

/* List */
.ep-list { display: flex; flex-direction: column; gap: 6px; }
.ep-list-item {
  display: flex; align-items: center; gap: 10px;
  font-size: 14px; color: #374151;
  padding: 8px 12px;
  background: #f9fafb;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
}
.ep-dim { opacity: 0.4; }
.ep-list-dot { width: 6px; height: 6px; border-radius: 50%; background: #9ca3af; flex-shrink: 0; }

/* Button */
.ep-btn-row { display: flex; align-items: center; padding: 4px 0; }
.ep-btn {
  border: none; border-radius: 6px; padding: 10px 22px; font-size: 14px;
  font-weight: 600; cursor: pointer; font-family: inherit;
}
.ep-btn-primary   { background: #2563eb; color: #fff; }
.ep-btn-secondary { background: #f3f4f6; color: #374151; border: 1px solid #d1d5db; }
.ep-btn-ghost     { background: transparent; color: #2563eb; border: 1px solid #2563eb; }

/* Form */
.ep-form { display: flex; flex-direction: column; gap: 10px; }
.ep-form-row { display: flex; flex-direction: column; gap: 4px; }
.ep-label { font-size: 12px; font-weight: 500; color: #6b7280; }
.ep-input-mock { height: 34px; background: #fff; border: 1px solid #d1d5db; border-radius: 6px; }
.ep-form-submit { align-self: flex-start; margin-top: 2px; }

/* Stream */
.ep-stream { display: flex; flex-direction: column; gap: 7px; }
.ep-stream-line { height: 12px; background: #e5e7eb; border-radius: 4px; }
.ep-cursor { font-size: 14px; color: #6b7280; animation: blink 1s step-end infinite; }
@keyframes blink { 0%, 100% { opacity: 1 } 50% { opacity: 0 } }

/* JSON */
.ep-json {
  margin: 0; font-size: 12px; line-height: 1.65;
  background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px;
  padding: 10px 14px; overflow: auto; color: #334155;
}
.ep-json-b { color: #64748b; }
.ep-json-k { color: #7c3aed; }
.ep-json-s { color: #059669; }
.ep-json-n { color: #d97706; }

/* Divider */
.ep-divider { border: none; border-top-style: solid; }

/* Spacer */
.ep-spacer {
  display: flex; align-items: center; justify-content: center;
  border: 1px dashed #d1d5db; border-radius: 4px;
}
.ep-spacer-label { font-size: 10px; color: #9ca3af; font-family: monospace; }

/* Source label */
.ep-source {
  font-size: 10px; color: #9ca3af; font-family: monospace;
  padding-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
</style>
