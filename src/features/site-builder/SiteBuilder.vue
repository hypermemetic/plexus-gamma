<template>
  <div class="site-builder">

    <!-- ── Left: component palette ─────────────────────────── -->
    <aside class="sb-palette">
      <div class="sb-palette-header">Components</div>
      <div
        v-for="meta in COMPONENT_PALETTE"
        :key="meta.type"
        class="sb-palette-item"
        draggable="true"
        :title="meta.description"
        @dragstart="onPaletteDragStart(meta.type, $event)"
      >
        <span class="sb-palette-icon">{{ meta.icon }}</span>
        <span class="sb-palette-label">{{ meta.label }}</span>
      </div>

      <div class="sb-palette-sep" />

      <!-- Site-level settings -->
      <div class="sb-palette-header">Site</div>
      <div class="sb-site-field">
        <label>Name</label>
        <input v-model="site.name" class="sb-input" />
      </div>
      <div class="sb-site-field">
        <label>Backend URL</label>
        <input v-model="site.backendUrl" class="sb-input" placeholder="ws://127.0.0.1:4444" />
      </div>

      <div class="sb-palette-sep" />

      <!-- Actions -->
      <button class="sb-action-btn" @click="exportHTML">⬇ Export HTML</button>
      <button class="sb-action-btn sb-action-danger" @click="confirmReset">↺ Reset</button>
    </aside>

    <!-- ── Center: canvas ──────────────────────────────────── -->
    <div class="sb-canvas-area">
      <!-- Page tabs -->
      <div class="sb-page-tabs">
        <button
          v-for="page in site.pages"
          :key="page.id"
          class="sb-page-tab"
          :class="{ active: page.id === activePageId }"
          @click="activePageId = page.id"
        >{{ page.title }}</button>
        <button class="sb-page-tab sb-page-add" @click="addPage">+</button>
      </div>

      <!-- Canvas -->
      <div
        ref="canvasEl"
        class="sb-canvas"
        :style="{ background: activePage?.background ?? 'var(--bg)' }"
        @dragover.prevent
        @drop="onCanvasDrop"
        @click.self="selectedId = null"
      >
        <BuilderNode
          v-for="comp in activePage?.components ?? []"
          :key="comp.id"
          :component="comp"
          :selected="comp.id === selectedId"
          @select="selectedId = comp.id"
          @move="(x, y) => moveComponent(comp.id, x, y)"
          @resize="(w, h) => resizeComponent(comp.id, w, h)"
          @delete="removeComponent(comp.id)"
        />
      </div>
    </div>

    <!-- ── Right: binding / props panel ───────────────────── -->
    <aside class="sb-props-panel">
      <template v-if="selectedComponent">
        <BindingPanel
          :component="selectedComponent"
          @update-prop="(k, v) => updateProp(selectedComponent!.id, k, v)"
          @set-binding="(b) => setBinding(selectedComponent!.id, b)"
        />
      </template>
      <div v-else class="sb-no-selection">
        <span>Select a component<br/>to configure it</span>
      </div>
    </aside>

  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { COMPONENT_PALETTE } from './types'
import type { ComponentType } from './types'
import { useSiteBuilder } from './useSiteBuilder'
import { downloadHTML } from './useSiteExport'
import BuilderNode from './BuilderNode.vue'
import BindingPanel from './BindingPanel.vue'

const {
  site,
  activePageId,
  activePage,
  selectedId,
  selectedComponent,
  addComponent,
  removeComponent,
  moveComponent,
  resizeComponent,
  updateProp,
  setBinding,
  resetSite,
  addPage,
} = useSiteBuilder()

const canvasEl = ref<HTMLElement | null>(null)

// ─── Palette drag ─────────────────────────────────────────
let draggedType: ComponentType | null = null

function onPaletteDragStart(type: ComponentType, e: DragEvent) {
  draggedType = type
  e.dataTransfer!.effectAllowed = 'copy'
}

function onCanvasDrop(e: DragEvent) {
  if (!draggedType || !canvasEl.value) return
  const rect = canvasEl.value.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  addComponent(draggedType, Math.round(x), Math.round(y))
  draggedType = null
}

// ─── Actions ──────────────────────────────────────────────
function exportHTML() { downloadHTML(site) }

function confirmReset() {
  if (confirm('Reset the site? All components and bindings will be lost.')) resetSite()
}

</script>

<style scoped>
.site-builder {
  display: flex;
  height: 100%;
  overflow: hidden;
}

/* ── Palette ──────────────────────────────────────────── */
.sb-palette {
  width: 160px;
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  background: var(--bg-2);
  display: flex;
  flex-direction: column;
  padding: 8px 0;
  overflow-y: auto;
  gap: 2px;
}

.sb-palette-header {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--text-dim);
  padding: 6px 12px 4px;
}

.sb-palette-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  cursor: grab;
  border-radius: 4px;
  margin: 0 6px;
  font-size: 12px;
  color: var(--text-muted);
  transition: background 0.08s, color 0.08s;
  user-select: none;
}
.sb-palette-item:hover {
  background: var(--bg-3);
  color: var(--text);
}
.sb-palette-icon {
  font-size: 13px;
  width: 18px;
  text-align: center;
  flex-shrink: 0;
}

.sb-palette-sep { height: 1px; background: var(--border); margin: 8px 0; }

.sb-site-field {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 3px 10px;
}
.sb-site-field label {
  font-size: 10px;
  color: var(--text-dim);
}
.sb-input {
  background: var(--bg-3);
  border: 1px solid var(--border-2);
  border-radius: 4px;
  color: var(--text);
  font-size: 11px;
  padding: 4px 6px;
  outline: none;
  width: 100%;
}
.sb-input:focus { border-color: var(--accent); }

.sb-action-btn {
  margin: 4px 10px 0;
  padding: 6px 10px;
  background: var(--bg-3);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-muted);
  font-size: 11px;
  cursor: pointer;
  text-align: left;
  transition: background 0.08s, color 0.08s;
}
.sb-action-btn:hover { background: var(--accent-bg); color: var(--accent); }
.sb-action-danger:hover { background: rgba(255,80,80,0.1); color: #f87171; border-color: rgba(255,80,80,0.2); }

/* ── Canvas area ──────────────────────────────────────── */
.sb-canvas-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sb-page-tabs {
  display: flex;
  border-bottom: 1px solid var(--border);
  background: var(--bg-2);
  flex-shrink: 0;
  overflow-x: auto;
}
.sb-page-tab {
  padding: 6px 14px;
  font-size: 12px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--text-muted);
  cursor: pointer;
  white-space: nowrap;
}
.sb-page-tab:hover { color: var(--text); }
.sb-page-tab.active { color: var(--accent); border-bottom-color: var(--accent); }
.sb-page-add { color: var(--text-dim); }

.sb-canvas {
  flex: 1;
  position: relative;
  overflow: auto;
  /* dot-grid background */
  background-image: radial-gradient(circle, rgba(255,255,255,0.08) 1px, transparent 1px);
  background-size: 20px 20px;
  min-width: 1440px;
  min-height: 900px;
}

/* ── Right panel ──────────────────────────────────────── */
.sb-props-panel {
  width: 240px;
  flex-shrink: 0;
  border-left: 1px solid var(--border);
  background: var(--bg-2);
  overflow-y: auto;
}

.sb-no-selection {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-dim);
  font-size: 11px;
  text-align: center;
  padding: 16px;
  line-height: 1.6;
}
</style>
