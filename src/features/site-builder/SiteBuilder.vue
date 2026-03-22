<template>
  <div class="site-builder">

    <!-- ── Left: component palette (edit mode only) ─────────── -->
    <aside v-if="mode === 'edit'" class="sb-palette">
      <div class="sb-palette-header">Add</div>
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
      <button class="sb-action-btn sb-action-danger" @click="confirmReset">↺ Reset</button>
    </aside>

    <!-- ── Center: canvas / preview ────────────────────────── -->
    <div class="sb-center">

      <!-- Toolbar -->
      <div class="sb-toolbar">
        <!-- Page tabs -->
        <div class="sb-page-tabs">
          <button
            v-for="page in site.pages"
            :key="page.id"
            class="sb-page-tab"
            :class="{ active: page.id === activePageId }"
            @click="activePageId = page.id"
          >{{ page.title }}</button>
          <button class="sb-page-tab sb-page-add" title="Add page" @click="addPage">+</button>
        </div>

        <div class="sb-toolbar-spacer" />

        <!-- Mode toggle -->
        <div class="sb-mode-toggle">
          <button class="sb-mode-btn" :class="{ active: mode === 'edit' }"    @click="mode = 'edit'">Edit</button>
          <button class="sb-mode-btn" :class="{ active: mode === 'preview' }" @click="mode = 'preview'">Preview</button>
        </div>

        <button class="sb-export-btn" @click="exportHTML">⬇ Export HTML</button>
      </div>

      <!-- Edit canvas -->
      <div
        v-if="mode === 'edit'"
        ref="canvasEl"
        class="sb-canvas"
        @dragover.prevent
        @drop="onCanvasDrop"
        @click.self="selectedId = null"
      >
        <!-- Page surface — looks like a real webpage -->
        <div
          class="sb-page-surface"
          :style="{ background: activePage?.background ?? '#ffffff' }"
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

          <!-- Empty state -->
          <div v-if="(activePage?.components ?? []).length === 0" class="sb-empty">
            <div class="sb-empty-icon">⊕</div>
            <p>Drag components from the left panel onto the page</p>
          </div>
        </div>
      </div>

      <!-- Preview iframe -->
      <div v-else class="sb-preview-wrap">
        <iframe
          class="sb-preview-frame"
          :srcdoc="previewHTML"
          sandbox="allow-scripts allow-same-origin"
        />
      </div>
    </div>

    <!-- ── Right: binding / props panel (edit + selected) ──── -->
    <aside v-if="mode === 'edit'" class="sb-props-panel">
      <template v-if="selectedComponent">
        <BindingPanel
          :component="selectedComponent"
          @update-prop="(k, v) => updateProp(selectedComponent!.id, k, v)"
          @set-binding="(b) => setBinding(selectedComponent!.id, b)"
          @move="(x, y) => moveComponent(selectedComponent!.id, x, y)"
          @resize="(w, h) => resizeComponent(selectedComponent!.id, w, h)"
        />
      </template>
      <div v-else class="sb-no-selection">
        <div class="sb-no-selection-icon">↖</div>
        <p>Select a component to configure its props and method binding</p>
      </div>
    </aside>

  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { COMPONENT_PALETTE } from './types'
import type { ComponentType } from './types'
import { useSiteBuilder } from './useSiteBuilder'
import { exportSiteHTML, downloadHTML } from './useSiteExport'
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

const mode     = ref<'edit' | 'preview'>('edit')
const canvasEl = ref<HTMLElement | null>(null)

// Re-compute preview HTML whenever anything changes
const previewHTML = computed(() => exportSiteHTML(site))

// ─── Palette drag ─────────────────────────────────────────
let draggedType: ComponentType | null = null

function onPaletteDragStart(type: ComponentType, e: DragEvent) {
  draggedType = type
  e.dataTransfer!.effectAllowed = 'copy'
}

function onCanvasDrop(e: DragEvent) {
  if (!draggedType || !canvasEl.value) return
  // Account for the page surface offset inside the scroll canvas
  const surface = canvasEl.value.querySelector('.sb-page-surface') as HTMLElement | null
  const rect = (surface ?? canvasEl.value).getBoundingClientRect()
  addComponent(draggedType, Math.round(e.clientX - rect.left), Math.round(e.clientY - rect.top))
  draggedType = null
}

function exportHTML() { downloadHTML(site) }
function confirmReset() {
  if (confirm('Reset the site? All components and bindings will be lost.')) {
    resetSite()
    selectedId.value = null
  }
}
</script>

<style scoped>
.site-builder {
  display: flex;
  height: 100%;
  overflow: hidden;
  background: var(--bg-0);
}

/* ── Palette ──────────────────────────────────────────────── */
.sb-palette {
  width: 148px;
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  background: var(--bg-2);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: 6px 0;
  gap: 1px;
}

.sb-palette-header {
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-dim);
  padding: 6px 12px 3px;
}

.sb-palette-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  cursor: grab;
  font-size: 12px;
  color: var(--text-muted);
  transition: background 0.08s, color 0.08s;
  user-select: none;
  border-radius: 3px;
  margin: 0 4px;
}
.sb-palette-item:hover { background: var(--bg-3); color: var(--text); }
.sb-palette-icon { width: 16px; text-align: center; flex-shrink: 0; font-size: 12px; }

.sb-palette-sep { height: 1px; background: var(--border); margin: 6px 0; }

.sb-site-field { display: flex; flex-direction: column; gap: 2px; padding: 2px 10px; }
.sb-site-field label { font-size: 9px; color: var(--text-dim); }
.sb-input {
  background: var(--bg-3); border: 1px solid var(--border-2); border-radius: 3px;
  color: var(--text); font-size: 11px; padding: 3px 6px; outline: none; width: 100%;
}
.sb-input:focus { border-color: var(--accent); }

.sb-action-btn {
  margin: 3px 8px 0;
  padding: 5px 10px;
  background: none; border: 1px solid var(--border); border-radius: 3px;
  color: var(--text-dim); font-size: 11px; cursor: pointer; text-align: left;
  font-family: inherit;
}
.sb-action-danger:hover { background: rgba(255,80,80,0.08); color: #f87171; border-color: rgba(255,80,80,0.2); }

/* ── Center ───────────────────────────────────────────────── */
.sb-center {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

/* Toolbar */
.sb-toolbar {
  display: flex;
  align-items: center;
  height: 34px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-2);
  padding: 0 8px;
  gap: 6px;
  flex-shrink: 0;
}

.sb-page-tabs { display: flex; align-items: stretch; gap: 0; overflow-x: auto; }
.sb-page-tab {
  padding: 0 12px; background: none; border: none;
  border-bottom: 2px solid transparent;
  color: var(--text-dim); font-size: 11px; cursor: pointer; white-space: nowrap;
  font-family: inherit;
}
.sb-page-tab:hover { color: var(--text-muted); }
.sb-page-tab.active { color: var(--accent); border-bottom-color: var(--accent); }
.sb-page-add { color: var(--text-dim); padding: 0 8px; }

.sb-toolbar-spacer { flex: 1; }

.sb-mode-toggle {
  display: flex;
  background: var(--bg-3);
  border-radius: 5px;
  padding: 2px;
  gap: 1px;
}
.sb-mode-btn {
  background: none; border: none; color: var(--text-dim); font-family: inherit;
  font-size: 11px; padding: 2px 10px; border-radius: 4px; cursor: pointer;
  transition: background 0.1s, color 0.1s;
}
.sb-mode-btn.active { background: var(--bg-0); color: var(--text); }

.sb-export-btn {
  background: none; border: 1px solid var(--border-2); border-radius: 4px;
  color: var(--text-muted); font-family: inherit; font-size: 11px;
  padding: 3px 10px; cursor: pointer;
}
.sb-export-btn:hover { border-color: var(--accent); color: var(--accent); }

/* Edit canvas — scrollable, grey surround (like Figma) */
.sb-canvas {
  flex: 1;
  overflow: auto;
  background: #1a1d21;
  padding: 40px;
  display: flex;
  justify-content: center;
  align-items: flex-start;
}

/* The actual "page" — white, looks like a real website */
.sb-page-surface {
  position: relative;
  width: 1280px;
  min-height: 900px;
  background: #ffffff;
  box-shadow: 0 4px 40px rgba(0,0,0,0.5);
  flex-shrink: 0;
}

.sb-empty {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  pointer-events: none;
}
.sb-empty-icon { font-size: 32px; opacity: 0.2; color: #666; }
.sb-empty p { font-size: 13px; color: #9ca3af; text-align: center; max-width: 240px; line-height: 1.5; margin: 0; font-family: system-ui, sans-serif; }

/* Preview iframe */
.sb-preview-wrap {
  flex: 1;
  overflow: hidden;
  background: #fff;
  display: flex;
  flex-direction: column;
}
.sb-preview-frame {
  flex: 1;
  border: none;
  width: 100%;
}

/* ── Right panel ──────────────────────────────────────────── */
.sb-props-panel {
  width: 240px;
  flex-shrink: 0;
  border-left: 1px solid var(--border);
  background: var(--bg-2);
  overflow-y: auto;
}

.sb-no-selection {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 8px;
  padding: 24px;
  text-align: center;
}
.sb-no-selection-icon { font-size: 24px; color: var(--text-dim); opacity: 0.4; }
.sb-no-selection p { font-size: 11px; color: var(--text-dim); line-height: 1.6; margin: 0; }
</style>
