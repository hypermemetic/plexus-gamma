<template>
  <Transition name="banner-slide">
    <div v-if="diff" class="diff-banner" @click.self="emit('dismiss')">
      <!-- Collapsed / expanded header row -->
      <div class="banner-header">
        <span class="banner-icon">⚡</span>
        <span class="banner-title">Schema changed</span>
        <span class="banner-backend">{{ diff.backendName }}</span>
        <span class="banner-count">{{ diff.diffs.length }} change{{ diff.diffs.length !== 1 ? 's' : '' }}</span>

        <div class="banner-actions">
          <button class="banner-btn banner-btn--ghost" @click="toggleExpanded">
            {{ expanded ? '▴ hide' : 'see diff ▾' }}
          </button>
          <button class="banner-btn banner-btn--primary" @click="emit('accept')">
            reload
          </button>
          <button class="banner-btn banner-btn--close" @click="emit('dismiss')" title="Dismiss">
            ✕
          </button>
        </div>
      </div>

      <!-- Expanded diff rows -->
      <Transition name="diff-expand">
        <div v-if="expanded && diff.diffs.length > 0" class="diff-body">
          <div
            v-for="entry in diff.diffs"
            :key="entry.path"
            class="diff-row"
            :class="`diff-row--${entry.kind}`"
          >
            <span class="diff-sigil">{{ sigil(entry.kind) }}</span>
            <span class="diff-path">{{ entry.path }}</span>
            <span class="diff-label">({{ entry.kind }})</span>
            <span v-if="entry.kind === 'changed'" class="diff-hashes">
              {{ entry.oldHash?.slice(0, 6) }} → {{ entry.newHash?.slice(0, 6) }}
            </span>
          </div>
        </div>
      </Transition>

      <!-- Expanded but no individual diffs (schema changed, details unavailable) -->
      <Transition name="diff-expand">
        <div v-if="expanded && diff.diffs.length === 0" class="diff-body diff-body--empty">
          <span class="diff-empty-msg">Schema changed — details unavailable</span>
        </div>
      </Transition>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { SchemaDiffResult, MethodDiff } from './useSchemaDiff'

const props = defineProps<{
  diff: SchemaDiffResult | null
}>()

const emit = defineEmits<{
  dismiss: []
  accept: []
}>()

// Collapse when a new diff arrives
const expanded = ref(false)

function toggleExpanded(): void {
  expanded.value = !expanded.value
}

function sigil(kind: MethodDiff['kind']): string {
  if (kind === 'added')   return '+'
  if (kind === 'removed') return '-'
  return '~'
}

// Reset expansion whenever the diff changes identity
// (handles dismiss → new diff arriving later)
import { watch } from 'vue'
watch(() => props.diff, () => { expanded.value = false })
</script>

<style scoped>
/* ── Layout ─────────────────────────────────────────────────── */
.diff-banner {
  position: sticky;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--bg-2);
  border-top: 1px solid var(--border);
  font-family: 'Berkeley Mono', 'Fira Code', 'Cascadia Code', ui-monospace, monospace;
  font-size: 12px;
  color: var(--text);
  z-index: 100;
  box-shadow: var(--shadow-sm);
}

/* ── Header row ─────────────────────────────────────────────── */
.banner-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  min-height: 34px;
}

.banner-icon {
  font-size: 13px;
  color: var(--accent);
  flex-shrink: 0;
}

.banner-title {
  font-weight: 600;
  color: var(--text-2);
  white-space: nowrap;
}

.banner-backend {
  color: var(--accent);
  font-size: 11px;
  background: var(--accent-bg);
  border: 1px solid var(--accent-bg-2);
  border-radius: 3px;
  padding: 1px 6px;
  white-space: nowrap;
}

.banner-count {
  color: var(--text-muted);
  font-size: 11px;
  white-space: nowrap;
}

.banner-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  flex-shrink: 0;
}

/* ── Buttons ────────────────────────────────────────────────── */
.banner-btn {
  background: none;
  border: 1px solid var(--border-2);
  color: var(--text-muted);
  font-family: inherit;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
  line-height: 1.4;
}

.banner-btn:hover {
  color: var(--text);
  border-color: var(--text-dim);
}

.banner-btn--ghost {
  color: var(--accent);
  border-color: var(--accent-bg-2);
  background: #0d1a2d;
}
.banner-btn--ghost:hover {
  background: var(--accent-bg);
  border-color: var(--accent);
}

.banner-btn--primary {
  color: var(--accent);
  border-color: var(--accent-bg-2);
  background: var(--accent-bg);
}
.banner-btn--primary:hover {
  background: var(--accent-bg-2);
  border-color: var(--accent);
}

.banner-btn--close {
  padding: 2px 5px;
  font-size: 11px;
  color: var(--text-dim);
  border-color: transparent;
}
.banner-btn--close:hover {
  color: var(--red);
  border-color: var(--red-bg);
  background: var(--red-bg);
}

/* ── Diff body ──────────────────────────────────────────────── */
.diff-body {
  border-top: 1px solid var(--border);
  padding: 6px 14px 8px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  max-height: 220px;
  overflow-y: auto;
}

.diff-body--empty {
  padding: 8px 14px;
}

.diff-empty-msg {
  color: var(--text-dim);
  font-size: 11px;
  font-style: italic;
}

/* ── Diff rows ──────────────────────────────────────────────── */
.diff-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 11px;
  line-height: 1.6;
}

.diff-sigil {
  font-weight: 700;
  width: 10px;
  flex-shrink: 0;
  font-size: 12px;
}

.diff-path {
  color: var(--text-2);
  font-size: 11px;
}

.diff-label {
  color: var(--text-dim);
  font-size: 10px;
}

.diff-hashes {
  color: var(--text-dim);
  font-size: 10px;
  font-family: inherit;
}

/* Per-kind colours */
.diff-row--added .diff-sigil   { color: var(--green); }
.diff-row--added .diff-path    { color: var(--green); }
.diff-row--added .diff-label   { color: #2ea043; }

.diff-row--changed .diff-sigil { color: var(--yellow); }
.diff-row--changed .diff-path  { color: var(--yellow); }
.diff-row--changed .diff-label { color: #bb8009; }
.diff-row--changed .diff-hashes { color: var(--text-muted); }

.diff-row--removed .diff-sigil { color: var(--red); }
.diff-row--removed .diff-path  { color: var(--red); }
.diff-row--removed .diff-label { color: #b91c1c; }

/* ── Transitions ────────────────────────────────────────────── */
.banner-slide-enter-active,
.banner-slide-leave-active {
  transition: transform 0.22s ease, opacity 0.22s ease;
}
.banner-slide-enter-from,
.banner-slide-leave-to {
  transform: translateY(100%);
  opacity: 0;
}

.diff-expand-enter-active,
.diff-expand-leave-active {
  transition: max-height 0.18s ease, opacity 0.18s ease;
  overflow: hidden;
}
.diff-expand-enter-from,
.diff-expand-leave-to {
  max-height: 0;
  opacity: 0;
}
.diff-expand-enter-to,
.diff-expand-leave-from {
  max-height: 220px;
  opacity: 1;
}
</style>
