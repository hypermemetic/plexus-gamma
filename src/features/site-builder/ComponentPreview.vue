<template>
  <div class="cp-root">
    <template v-if="component.type === 'text'">
      <p class="cp-text" :style="{ fontSize: ((component.props.fontSize as number) ?? 14) + 'px', textAlign: ((component.props.align as string) ?? 'left') as 'left'|'center'|'right' }">
        {{ component.binding ? `[${component.binding.method}]` : (component.props.content as string || 'Text block') }}
      </p>
    </template>

    <template v-else-if="component.type === 'heading'">
      <component
        :is="'h' + (component.props.level ?? 1)"
        class="cp-heading"
        :style="{ textAlign: ((component.props.align as string) ?? 'left') as 'left'|'center'|'right' }"
      >
        {{ component.binding ? `[${component.binding.method}]` : (component.props.content as string || 'Heading') }}
      </component>
    </template>

    <template v-else-if="component.type === 'list'">
      <div class="cp-list-preview">
        <div class="cp-list-row">Item 1</div>
        <div class="cp-list-row">Item 2</div>
        <div class="cp-list-row cp-list-row-dim">…</div>
        <span v-if="component.binding" class="cp-bound-hint">← {{ component.binding.method }}</span>
      </div>
    </template>

    <template v-else-if="component.type === 'button'">
      <div class="cp-button" :class="component.props.variant as string ?? 'primary'">
        {{ component.props.label as string || 'Button' }}
      </div>
    </template>

    <template v-else-if="component.type === 'form'">
      <div class="cp-form-preview">
        <div class="cp-form-field" />
        <div class="cp-form-field cp-form-field-short" />
        <div class="cp-form-submit">{{ component.props.submitLabel as string || 'Submit' }}</div>
      </div>
    </template>

    <template v-else-if="component.type === 'stream'">
      <div class="cp-stream-preview">
        <span class="cp-stream-cursor">█</span>
        <span v-if="component.binding" class="cp-bound-hint"> {{ component.binding.method }}</span>
      </div>
    </template>

    <template v-else-if="component.type === 'json'">
      <div class="cp-json-preview">{ "type": "…" }</div>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { ComponentInstance } from './types'

defineProps<{ component: ComponentInstance }>()
</script>

<style scoped>
.cp-root { height: 100%; overflow: hidden; }
.cp-text { margin: 0; line-height: 1.5; color: var(--text-muted); }
.cp-heading { margin: 0; font-size: 1.1em; color: var(--text); }
.cp-bound-hint { font-size: 9px; color: var(--accent); display: block; margin-top: 2px; }

.cp-list-preview { display: flex; flex-direction: column; gap: 3px; }
.cp-list-row { background: rgba(255,255,255,0.05); border-radius: 3px; padding: 3px 6px; font-size: 10px; color: var(--text-muted); }
.cp-list-row-dim { opacity: 0.4; }

.cp-button {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 5px 12px; border-radius: 4px; font-size: 11px; font-weight: 500;
}
.cp-button.primary   { background: var(--accent-bg); color: var(--accent); }
.cp-button.secondary { background: var(--bg-3); color: var(--text-muted); }
.cp-button.ghost     { border: 1px solid var(--border-2); color: var(--text-muted); }

.cp-form-preview { display: flex; flex-direction: column; gap: 4px; }
.cp-form-field { height: 16px; background: rgba(255,255,255,0.05); border-radius: 3px; }
.cp-form-field-short { width: 60%; }
.cp-form-submit { margin-top: 4px; padding: 4px 10px; background: var(--accent-bg); color: var(--accent); border-radius: 3px; font-size: 10px; display: inline-block; }

.cp-stream-preview { font-family: monospace; font-size: 11px; color: var(--text-dim); }
.cp-stream-cursor { animation: blink 1s step-end infinite; }
@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }

.cp-json-preview { font-family: monospace; font-size: 10px; color: var(--text-dim); }
</style>
