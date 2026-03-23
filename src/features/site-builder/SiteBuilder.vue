<template>
  <div class="site-builder">

    <!-- ── Left: element palette ─────────────────────────────── -->
    <aside v-if="mode === 'edit'" class="sb-palette">
      <div class="sb-palette-header">Elements</div>
      <button
        v-for="meta in ELEMENT_PALETTE"
        :key="meta.type"
        class="sb-palette-item"
        :title="meta.description"
        @click="paletteAdd(meta.type)"
      >
        <span class="sb-palette-icon">{{ meta.icon }}</span>
        <span class="sb-palette-label">{{ meta.label }}</span>
      </button>

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

    <!-- ── Center: canvas / preview ─────────────────────────── -->
    <div class="sb-center">

      <!-- Toolbar -->
      <div class="sb-toolbar">
        <div class="sb-page-tabs">
          <button
            v-for="page in site.pages"
            :key="page.id"
            class="sb-page-tab"
            :class="{ active: page.id === activePageId }"
            @click="setActivePage(page.id)"
          >{{ page.title }}</button>
          <button class="sb-page-tab sb-page-add" title="Add page" @click="addPage()">+</button>
        </div>
        <div class="sb-toolbar-spacer" />
        <div class="sb-mode-toggle">
          <button class="sb-mode-btn" :class="{ active: mode === 'edit' }"    @click="mode = 'edit'">Edit</button>
          <button class="sb-mode-btn" :class="{ active: mode === 'preview' }" @click="mode = 'preview'">Preview</button>
        </div>
        <button class="sb-export-btn" @click="exportHTML">⬇ Export HTML</button>
      </div>

      <!-- Edit canvas -->
      <div v-if="mode === 'edit'" class="sb-canvas" @click.self="selectedElementId = null">
        <div class="sb-page-doc">

          <!-- Sections -->
          <div
            v-for="(section, si) in activePage?.sections ?? []"
            :key="section.id"
            class="sb-section"
            :style="{ background: section.background === 'transparent' ? undefined : section.background, paddingTop: section.paddingY + 'px', paddingBottom: section.paddingY + 'px' }"
          >
            <!-- Section controls -->
            <div class="sb-section-bar">
              <span class="sb-section-label">§ {{ si + 1 }}</span>
              <div class="sb-section-actions">
                <!-- Background color -->
                <label class="sb-color-swatch" :title="'Section background'">
                  <input type="color" class="sb-color-input"
                    :value="section.background === 'transparent' ? '#ffffff' : section.background"
                    @change="setSectionBackground(section.id, ($event.target as HTMLInputElement).value)"
                  />
                  <span class="sb-color-dot" :style="{ background: section.background === 'transparent' ? 'transparent' : section.background }" />
                </label>
                <button class="sb-sec-btn" title="Move up"   @click="moveSectionUp(section.id)">↑</button>
                <button class="sb-sec-btn" title="Move down" @click="moveSectionDown(section.id)">↓</button>
                <button class="sb-sec-btn" title="Add column" @click="addColumn(section.id)">+col</button>
                <button class="sb-sec-btn sb-sec-danger" title="Delete section" @click="deleteSection(section.id)">✕</button>
              </div>
            </div>

            <!-- Columns -->
            <div class="sb-columns" :style="{ gridTemplateColumns: section.columns.map(c => `${c.span}fr`).join(' ') }">
              <div
                v-for="(col, ci) in section.columns"
                :key="col.id"
                class="sb-column"
                :class="{ 'sb-col-active': col.id === activeColumnId }"
                @click.self="activeColumnId = col.id"
              >
                <!-- Column header -->
                <div class="sb-col-header" @click.stop="activeColumnId = col.id">
                  <span class="sb-col-label">col {{ ci + 1 }} ({{ col.span }}/12)</span>
                  <button v-if="section.columns.length > 1" class="sb-col-del" title="Remove column" @click.stop="deleteColumn(section.id, col.id)">−</button>
                </div>

                <!-- Elements -->
                <div
                  v-for="el in col.elements"
                  :key="el.id"
                  class="sb-element"
                  :class="{ 'sb-el-selected': el.id === selectedElementId }"
                  @click.stop="selectElement(el.id, col.id)"
                >
                  <div class="sb-el-chrome">
                    <span class="sb-el-type">{{ el.type }}</span>
                    <span v-if="el.binding" class="sb-el-bound">⚡</span>
                    <div class="sb-el-actions">
                      <button class="sb-el-btn" title="Move up"   @click.stop="moveElementUp(el.id)">↑</button>
                      <button class="sb-el-btn" title="Move down" @click.stop="moveElementDown(el.id)">↓</button>
                      <button class="sb-el-btn sb-el-del" title="Delete" @click.stop="deleteElement(el.id)">✕</button>
                    </div>
                  </div>
                  <div class="sb-el-content">
                    <ElementPreview :element="el" />
                  </div>
                </div>

                <!-- Add element hint -->
                <div
                  class="sb-col-add"
                  :class="{ 'sb-col-add-active': col.id === activeColumnId }"
                  @click.stop="activeColumnId = col.id"
                >
                  {{ col.id === activeColumnId ? 'click palette to add →' : '+ click to focus' }}
                </div>
              </div>
            </div>
          </div>

          <!-- Add section -->
          <button class="sb-add-section" @click="addSection()">+ Add Section</button>

        </div>
      </div>

      <!-- Preview iframe -->
      <div v-else class="sb-preview-wrap">
        <iframe class="sb-preview-frame" :srcdoc="previewHTML" sandbox="allow-scripts allow-same-origin" />
      </div>
    </div>

    <!-- ── Right: props / binding panel ─────────────────────── -->
    <aside v-if="mode === 'edit'" class="sb-props-panel">
      <template v-if="selectedElement">
        <BindingPanel
          :element="selectedElement"
          @update-prop="(k, v) => updateElementProp(selectedElement!.id, k, v)"
          @set-binding="(b) => setElementBinding(selectedElement!.id, b)"
        />
      </template>
      <div v-else class="sb-no-sel">
        <div class="sb-no-sel-icon">↖</div>
        <p>Select an element to edit its props and method binding</p>
        <p v-if="activeColumnId" class="sb-active-col-hint">
          Active column set — click a palette element to add it
        </p>
      </div>
    </aside>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ELEMENT_PALETTE } from './types'
import type { ElementType, MethodBinding } from './types'
import { useSiteBuilder } from './useSiteBuilder'
import { exportSiteHTML, downloadHTML } from './useSiteExport'
import ElementPreview from './ElementPreview.vue'
import BindingPanel from './BindingPanel.vue'
import { registerAction } from '../../lib/useActionRegistry'

const {
  site,
  activePageId,
  activePage,
  selectedElementId,
  selectedElement,
  activeColumnId,
  addPage, deletePage, setActivePage, renamePage,
  addSection, deleteSection, moveSectionUp, moveSectionDown,
  setSectionBackground, setSectionPadding,
  addColumn, deleteColumn,
  addElement, deleteElement, moveElementUp, moveElementDown,
  updateElementProp, setElementBinding,
  resetSite, setSiteName, setBackendUrl,
} = useSiteBuilder()

const mode = ref<'edit' | 'preview'>('edit')

const previewHTML = computed(() => exportSiteHTML(site))

function selectElement(elementId: string, columnId: string) {
  selectedElementId.value = elementId
  activeColumnId.value = columnId
}

function paletteAdd(type: ElementType) {
  // Find the active column, or fall back to first column of last section
  const page = activePage.value
  if (!page) return
  let targetSectionId: string | null = null
  let targetColumnId: string | null = activeColumnId.value

  if (targetColumnId) {
    // Find the section this column belongs to
    for (const sec of page.sections) {
      if (sec.columns.some(c => c.id === targetColumnId)) {
        targetSectionId = sec.id
        break
      }
    }
  }

  if (!targetSectionId || !targetColumnId) {
    // Default: last section, first column
    const lastSection = page.sections[page.sections.length - 1]
    if (!lastSection) { addSection(); return paletteAdd(type) }
    targetSectionId = lastSection.id
    targetColumnId  = lastSection.columns[0]?.id ?? null
    if (!targetColumnId) return
    activeColumnId.value = targetColumnId
  }

  addElement(targetSectionId, targetColumnId, type)
}

function exportHTML() { downloadHTML(site) }

function confirmReset() {
  if (confirm('Reset the site? All content will be lost.')) resetSite()
}

// ─── Action registry (dispatch / RPC callable) ────────────────────────────────

const cleanups: (() => void)[] = []

function reg(key: string, fn: (p: Record<string, unknown>) => unknown) {
  cleanups.push(registerAction(key, fn))
}

onMounted(() => {
  // Site
  reg('site.getState',     ()                          => JSON.parse(JSON.stringify(site)))
  reg('site.setName',      ({ name })                  => { setSiteName(name as string); return { ok: true } })
  reg('site.setBackendUrl', ({ url })                  => { setBackendUrl(url as string); return { ok: true } })
  reg('site.reset',        ()                          => { resetSite(); return { ok: true } })
  reg('site.export',       ()                          => ({ html: exportSiteHTML(site) }))

  // Pages
  reg('site.addPage',       ()                         => { const p = addPage();                return { id: p.id, title: p.title } })
  reg('site.deletePage',    ({ pageId })               => { deletePage(pageId as string);        return { ok: true } })
  reg('site.setActivePage', ({ pageId })               => { setActivePage(pageId as string);     return { ok: true } })
  reg('site.renamePage',    ({ pageId, title })        => { renamePage(pageId as string, title as string); return { ok: true } })

  // Sections
  reg('site.addSection',          ({ after })                  => { const s = addSection(after as string | undefined); return { id: s.id } })
  reg('site.deleteSection',       ({ sectionId })              => { deleteSection(sectionId as string);               return { ok: true } })
  reg('site.moveSectionUp',       ({ sectionId })              => { moveSectionUp(sectionId as string);               return { ok: true } })
  reg('site.moveSectionDown',     ({ sectionId })              => { moveSectionDown(sectionId as string);             return { ok: true } })
  reg('site.setSectionBackground', ({ sectionId, background }) => { setSectionBackground(sectionId as string, background as string); return { ok: true } })
  reg('site.setSectionPadding',   ({ sectionId, paddingY })    => { setSectionPadding(sectionId as string, paddingY as number);      return { ok: true } })

  // Columns
  reg('site.addColumn',    ({ sectionId })              => { const c = addColumn(sectionId as string);                    return { id: c.id } })
  reg('site.deleteColumn', ({ sectionId, columnId })    => { deleteColumn(sectionId as string, columnId as string);       return { ok: true } })

  // Elements
  reg('site.addElement',         ({ sectionId, columnId, type }) => { const e = addElement(sectionId as string, columnId as string, type as ElementType); return { id: e.id } })
  reg('site.deleteElement',      ({ elementId })                  => { deleteElement(elementId as string);                  return { ok: true } })
  reg('site.moveElementUp',      ({ elementId })                  => { moveElementUp(elementId as string);                  return { ok: true } })
  reg('site.moveElementDown',    ({ elementId })                  => { moveElementDown(elementId as string);                return { ok: true } })
  reg('site.updateElementProp',  ({ elementId, key, value })      => { updateElementProp(elementId as string, key as string, value); return { ok: true } })
  reg('site.setElementBinding',  ({ elementId, binding })         => { setElementBinding(elementId as string, binding as MethodBinding | null); return { ok: true } })
})

onUnmounted(() => { cleanups.forEach(fn => fn()) })
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
  font-size: 9px; font-weight: 600; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--text-dim); padding: 6px 12px 3px;
}

.sb-palette-item {
  display: flex; align-items: center; gap: 8px; padding: 5px 12px;
  cursor: pointer; font-size: 12px; color: var(--text-muted);
  background: none; border: none; text-align: left; font-family: inherit;
  transition: background 0.08s, color 0.08s; border-radius: 3px; margin: 0 4px;
}
.sb-palette-item:hover { background: var(--bg-3); color: var(--text); }
.sb-palette-icon  { width: 16px; text-align: center; flex-shrink: 0; font-size: 12px; }
.sb-palette-label { font-size: 11px; }

.sb-palette-sep { height: 1px; background: var(--border); margin: 6px 0; }

.sb-site-field { display: flex; flex-direction: column; gap: 2px; padding: 2px 10px; }
.sb-site-field label { font-size: 9px; color: var(--text-dim); }
.sb-input {
  background: var(--bg-3); border: 1px solid var(--border-2); border-radius: 3px;
  color: var(--text); font-size: 11px; padding: 3px 6px; outline: none; width: 100%;
}
.sb-input:focus { border-color: var(--accent); }

.sb-action-btn {
  margin: 3px 8px 0; padding: 5px 10px;
  background: none; border: 1px solid var(--border); border-radius: 3px;
  color: var(--text-dim); font-size: 11px; cursor: pointer; text-align: left; font-family: inherit;
}
.sb-action-danger:hover { background: rgba(255,80,80,0.08); color: #f87171; border-color: rgba(255,80,80,0.2); }

/* ── Center ───────────────────────────────────────────────── */
.sb-center { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; }

/* Toolbar */
.sb-toolbar {
  display: flex; align-items: center; height: 34px; border-bottom: 1px solid var(--border);
  background: var(--bg-2); padding: 0 8px; gap: 6px; flex-shrink: 0;
}

.sb-page-tabs { display: flex; align-items: stretch; gap: 0; overflow-x: auto; }
.sb-page-tab {
  padding: 0 12px; background: none; border: none; border-bottom: 2px solid transparent;
  color: var(--text-dim); font-size: 11px; cursor: pointer; white-space: nowrap; font-family: inherit;
}
.sb-page-tab:hover { color: var(--text-muted); }
.sb-page-tab.active { color: var(--accent); border-bottom-color: var(--accent); }
.sb-page-add { color: var(--text-dim); padding: 0 8px; }

.sb-toolbar-spacer { flex: 1; }

.sb-mode-toggle { display: flex; background: var(--bg-3); border-radius: 5px; padding: 2px; gap: 1px; }
.sb-mode-btn {
  background: none; border: none; color: var(--text-dim); font-family: inherit;
  font-size: 11px; padding: 2px 10px; border-radius: 4px; cursor: pointer;
  transition: background 0.1s, color 0.1s;
}
.sb-mode-btn.active { background: var(--bg-0); color: var(--text); }

.sb-export-btn {
  background: none; border: 1px solid var(--border-2); border-radius: 4px;
  color: var(--text-muted); font-family: inherit; font-size: 11px; padding: 3px 10px; cursor: pointer;
}
.sb-export-btn:hover { border-color: var(--accent); color: var(--accent); }

/* Edit canvas */
.sb-canvas {
  flex: 1; overflow: auto; background: #1a1d21; padding: 32px 40px;
  display: flex; justify-content: center; align-items: flex-start;
}

/* The page document — looks like a real webpage */
.sb-page-doc {
  width: 100%;
  max-width: 1024px;
  min-height: 600px;
  background: #ffffff;
  box-shadow: 0 4px 40px rgba(0,0,0,0.5);
  border-radius: 4px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* Section */
.sb-section {
  position: relative;
  border-bottom: 1px solid #f0f0f0;
  transition: background 0.15s;
}
.sb-section:last-of-type { border-bottom: none; }

.sb-section-bar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 4px 10px; background: rgba(0,0,0,0.03); border-bottom: 1px solid rgba(0,0,0,0.05);
}
.sb-section-label { font-size: 9px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: #9ca3af; }
.sb-section-actions { display: flex; align-items: center; gap: 4px; }

.sb-color-swatch { display: flex; align-items: center; cursor: pointer; }
.sb-color-input { position: absolute; opacity: 0; width: 0; height: 0; }
.sb-color-dot { width: 12px; height: 12px; border-radius: 3px; border: 1px solid #d1d5db; }

.sb-sec-btn {
  padding: 1px 5px; background: none; border: 1px solid transparent; border-radius: 3px;
  font-size: 10px; color: #9ca3af; cursor: pointer; font-family: inherit;
}
.sb-sec-btn:hover { background: #f3f4f6; border-color: #e5e7eb; color: #374151; }
.sb-sec-danger:hover { background: rgba(239,68,68,0.08); color: #ef4444; border-color: rgba(239,68,68,0.2); }

/* Columns */
.sb-columns {
  display: grid;
  gap: 0;
  padding: 0 16px 16px;
  min-height: 80px;
}

.sb-column {
  min-height: 80px;
  border: 1px dashed transparent;
  border-radius: 4px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  cursor: default;
  transition: border-color 0.1s;
}
.sb-column:hover { border-color: rgba(37, 99, 235, 0.2); }
.sb-col-active { border-color: rgba(37, 99, 235, 0.45) !important; background: rgba(37, 99, 235, 0.03); }

.sb-col-header {
  display: flex; align-items: center; justify-content: space-between;
  cursor: pointer; padding: 0 2px;
}
.sb-col-label { font-size: 9px; color: #9ca3af; letter-spacing: 0.05em; text-transform: uppercase; font-weight: 500; }
.sb-col-del {
  background: none; border: none; color: #d1d5db; cursor: pointer; font-size: 11px; padding: 0 2px;
}
.sb-col-del:hover { color: #ef4444; }

/* Element */
.sb-element {
  border: 1px solid transparent;
  border-radius: 4px;
  cursor: pointer;
  transition: border-color 0.1s;
  background: #fff;
}
.sb-element:hover     { border-color: rgba(37,99,235,0.3); }
.sb-el-selected       { border-color: #2563eb !important; box-shadow: 0 0 0 1px #2563eb; }

.sb-el-chrome {
  display: flex; align-items: center; gap: 4px;
  padding: 3px 8px; background: #f9fafb; border-bottom: 1px solid #f0f0f0; border-radius: 3px 3px 0 0;
}
.sb-el-type { font-size: 9px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: #6b7280; flex: 1; }
.sb-el-bound { font-size: 10px; color: #2563eb; }
.sb-el-actions { display: flex; gap: 2px; }
.sb-el-btn {
  background: none; border: none; color: #d1d5db; cursor: pointer; font-size: 10px; padding: 0 3px;
}
.sb-el-btn:hover { color: #6b7280; }
.sb-el-del:hover { color: #ef4444 !important; }
.sb-el-content { padding: 10px 12px; }

/* Add to column hint */
.sb-col-add {
  padding: 6px; text-align: center; font-size: 10px; color: #d1d5db;
  border: 1px dashed #e5e7eb; border-radius: 4px; cursor: pointer;
  transition: all 0.1s; margin-top: auto;
}
.sb-col-add:hover { color: #9ca3af; border-color: #d1d5db; }
.sb-col-add-active { color: #2563eb !important; border-color: #93c5fd !important; background: rgba(37,99,235,0.04); }

/* Add section button */
.sb-add-section {
  display: block; width: 100%; padding: 14px; text-align: center; font-size: 12px;
  color: #9ca3af; background: #fafafa; border: none; border-top: 1px solid #f0f0f0;
  cursor: pointer; font-family: inherit; transition: background 0.1s, color 0.1s;
}
.sb-add-section:hover { background: #f3f4f6; color: #374151; }

/* Preview iframe */
.sb-preview-wrap { flex: 1; overflow: hidden; background: #fff; display: flex; flex-direction: column; }
.sb-preview-frame { flex: 1; border: none; width: 100%; }

/* ── Right panel ──────────────────────────────────────────── */
.sb-props-panel {
  width: 240px; flex-shrink: 0; border-left: 1px solid var(--border);
  background: var(--bg-2); overflow-y: auto;
}

.sb-no-sel {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  height: 100%; gap: 8px; padding: 24px; text-align: center;
}
.sb-no-sel-icon { font-size: 24px; color: var(--text-dim); opacity: 0.4; }
.sb-no-sel p { font-size: 11px; color: var(--text-dim); line-height: 1.6; margin: 0; }
.sb-active-col-hint { color: var(--accent) !important; opacity: 1; }
</style>
