<template>
  <div class="app-builder">

    <!-- ── Left: pages + method browser ─────────────────────── -->
    <aside class="ab-left">

      <!-- Project name -->
      <div class="ab-section-hdr">Project</div>
      <div class="ab-field">
        <label>Name</label>
        <input v-model="project.name" class="ab-input" @change="setProjectName(project.name)" />
      </div>

      <!-- Pages -->
      <div class="ab-section-hdr" style="margin-top:10px">
        Pages
        <button class="ab-hdr-btn" title="Add page" @click="addPage()">+</button>
      </div>
      <div class="ab-page-list">
        <div
          v-for="page in project.pages"
          :key="page.id"
          class="ab-page-row"
          :class="{ active: page.id === activePageId }"
          @click="setActivePage(page.id)"
        >
          <span class="ab-page-route">{{ page.route }}</span>
          <span class="ab-page-name">{{ page.title }}</span>
          <button
            v-if="project.pages.length > 1"
            class="ab-page-del"
            title="Delete page"
            @click.stop="deletePage(page.id)"
          >✕</button>
        </div>
      </div>

      <!-- Backends -->
      <div class="ab-section-hdr" style="margin-top:10px">Backends</div>
      <div
        v-for="(url, name) in project.backends"
        :key="name"
        class="ab-field"
      >
        <label>{{ name }}</label>
        <input
          :value="url"
          class="ab-input ab-input-sm"
          @change="setBackend(name, ($event.target as HTMLInputElement).value)"
        />
      </div>
      <div v-if="!Object.keys(project.backends).length" class="ab-hint">
        No backends connected
      </div>

      <div class="ab-left-spacer" />

      <!-- Block palette -->
      <div class="ab-section-hdr">Add Block</div>
      <button
        v-for="meta in BLOCK_PALETTE"
        :key="meta.type"
        class="ab-palette-item"
        :title="meta.description"
        @click="addBlockToActivePage(meta.type)"
      >
        <span class="ab-palette-icon">{{ meta.icon }}</span>
        <span class="ab-palette-label">{{ meta.label }}</span>
      </button>

      <div class="ab-palette-sep" />
      <button class="ab-danger-btn" @click="confirmReset">↺ Reset</button>
    </aside>

    <!-- ── Center: page editor + code preview ────────────────── -->
    <div class="ab-center">

      <!-- Toolbar -->
      <div class="ab-toolbar">
        <div v-if="activePage" class="ab-page-meta">
          <input
            :value="activePage.title"
            class="ab-toolbar-input"
            placeholder="Page title"
            @change="renamePage(activePage!.id, ($event.target as HTMLInputElement).value, toPascal(($event.target as HTMLInputElement).value), toRoute(($event.target as HTMLInputElement).value))"
          />
          <span class="ab-sep">/</span>
          <input
            :value="activePage.route"
            class="ab-toolbar-input ab-toolbar-route"
            placeholder="/route"
            @change="renamePage(activePage!.id, activePage!.title, activePage!.name, ($event.target as HTMLInputElement).value)"
          />
        </div>
        <div class="ab-toolbar-spacer" />
        <div class="ab-mode-toggle">
          <button class="ab-mode-btn" :class="{ active: centerMode === 'design' }"  @click="centerMode = 'design'">Design</button>
          <button class="ab-mode-btn" :class="{ active: centerMode === 'code' }"    @click="centerMode = 'code'">Code</button>
          <button class="ab-mode-btn ab-mode-claude" :class="{ active: centerMode === 'claude' }" @click="centerMode = 'claude'">✦ Claude</button>
        </div>
        <button class="ab-write-btn" @click="writeProject" title="Write project to disk">
          ⬇ Write to disk
        </button>
      </div>

      <!-- Design mode: block list -->
      <div v-if="centerMode === 'design'" class="ab-canvas" @click.self="selectedBlockId = null">
        <div v-if="activePage?.blocks.length === 0" class="ab-empty">
          <p>No blocks yet</p>
          <p class="ab-empty-hint">Click a block type in the left panel, or drag a method here</p>
        </div>

        <div
          v-for="block in activePage?.blocks ?? []"
          :key="block.id"
          class="ab-block"
          :class="{ selected: block.id === selectedBlockId }"
          @click.stop="selectedBlockId = block.id"
        >
          <!-- Block header -->
          <div class="ab-block-bar">
            <span class="ab-block-type">{{ block.type }}</span>
            <span v-if="block.binding" class="ab-block-binding">
              <span class="ab-block-bk">{{ block.binding.backend }}</span>.<span class="ab-block-method">{{ block.binding.method }}</span>
            </span>
            <span v-else class="ab-block-unbound">unbound</span>
            <div class="ab-block-actions">
              <button class="ab-blk-btn" @click.stop="moveBlockUp(block.id)" title="Move up">↑</button>
              <button class="ab-blk-btn" @click.stop="moveBlockDown(block.id)" title="Move down">↓</button>
              <button class="ab-blk-btn ab-blk-del" @click.stop="deleteBlock(block.id)" title="Delete">✕</button>
            </div>
          </div>

          <!-- Block preview -->
          <div class="ab-block-preview">
            <component :is="previewComponent(block)" v-bind="previewProps(block)" />
          </div>
        </div>
      </div>

      <!-- Claude chat mode -->
      <ClaudeChat
        v-else-if="centerMode === 'claude'"
        :project="project"
        :methods="methodIndex"
        class="ab-claude-panel"
      />

      <!-- Code mode: generated Vue SFC for the active page -->
      <div v-else class="ab-code-view">
        <div class="ab-code-tabs">
          <button
            v-for="tab in codeTabs"
            :key="tab.path"
            class="ab-code-tab"
            :class="{ active: codeTab === tab.path }"
            @click="codeTab = tab.path"
          >{{ tab.label }}</button>
        </div>
        <pre class="ab-code-pre">{{ currentCodeContent }}</pre>
      </div>
    </div>

    <!-- ── Right: block config (hidden in Claude mode) ──────── -->
    <aside v-if="selectedBlock && centerMode !== 'claude'" class="ab-right">
      <div class="ab-section-hdr">
        Block
        <span class="ab-block-id">{{ selectedBlock.id.slice(0, 6) }}</span>
      </div>

      <!-- Type selector -->
      <div class="ab-field">
        <label>Type</label>
        <select class="ab-select" :value="selectedBlock.type" @change="setBlockType(selectedBlock!.id, ($event.target as HTMLSelectElement).value as BlockType)">
          <option v-for="m in BLOCK_PALETTE" :key="m.type" :value="m.type">{{ m.label }}</option>
        </select>
      </div>

      <!-- Var name -->
      <div class="ab-field">
        <label>Var name</label>
        <input
          :value="selectedBlock.varName"
          class="ab-input"
          @change="setBlockVarName(selectedBlock!.id, ($event.target as HTMLInputElement).value)"
        />
      </div>

      <!-- Props -->
      <template v-if="selectedBlock.type === 'heading'">
        <div class="ab-field">
          <label>Text</label>
          <input :value="selectedBlock.props.label ?? ''" class="ab-input"
            @input="updateBlockProp(selectedBlock!.id, 'label', ($event.target as HTMLInputElement).value)" />
        </div>
        <div class="ab-field">
          <label>Level</label>
          <select class="ab-select" :value="selectedBlock.props.level ?? 2"
            @change="updateBlockProp(selectedBlock!.id, 'level', Number(($event.target as HTMLSelectElement).value))">
            <option value="1">H1</option><option value="2">H2</option><option value="3">H3</option>
          </select>
        </div>
      </template>

      <template v-else-if="selectedBlock.type === 'text'">
        <div class="ab-field">
          <label>Content</label>
          <textarea class="ab-textarea" :value="selectedBlock.props.label ?? ''"
            @input="updateBlockProp(selectedBlock!.id, 'label', ($event.target as HTMLTextAreaElement).value)" />
        </div>
      </template>

      <template v-else-if="selectedBlock.type === 'list'">
        <div class="ab-field">
          <label>Display field</label>
          <input :value="selectedBlock.props.listField ?? 'name'" class="ab-input"
            @change="updateBlockProp(selectedBlock!.id, 'listField', ($event.target as HTMLInputElement).value)" />
        </div>
      </template>

      <template v-else-if="selectedBlock.type === 'button' || selectedBlock.type === 'form'">
        <div class="ab-field">
          <label>Label</label>
          <input :value="selectedBlock.props.label ?? 'Submit'" class="ab-input"
            @input="updateBlockProp(selectedBlock!.id, 'label', ($event.target as HTMLInputElement).value)" />
        </div>
      </template>

      <template v-else-if="selectedBlock.type === 'stream'">
        <div class="ab-field">
          <label>Placeholder</label>
          <input :value="selectedBlock.props.placeholder ?? ''" class="ab-input"
            @input="updateBlockProp(selectedBlock!.id, 'placeholder', ($event.target as HTMLInputElement).value)" />
        </div>
      </template>

      <!-- Binding -->
      <div class="ab-section-hdr" style="margin-top:12px">Method Binding</div>

      <div v-if="selectedBlock.binding" class="ab-binding-current">
        <span class="ab-bk-badge">{{ selectedBlock.binding.backend }}</span>
        <code>{{ selectedBlock.binding.method }}</code>
        <button class="ab-clear-binding" @click="setBlockBinding(selectedBlock!.id, null)">✕</button>
      </div>
      <div v-else class="ab-hint">No binding — search below to bind a method</div>

      <input
        v-model="bindQuery"
        class="ab-input ab-bind-search"
        placeholder="Search methods…"
      />

      <div class="ab-method-list">
        <div
          v-for="entry in filteredMethods"
          :key="entry.fullPath"
          class="ab-method-row"
          :class="{ active: selectedBlock.binding?.backend === entry.backend && selectedBlock.binding?.method === (entry.callPath ?? entry.method.name) }"
          @click="bindMethod(entry)"
        >
          <span class="ab-method-bk" :style="{ color: bkColor(entry.backend) }">{{ entry.backend }}</span>
          <span class="ab-method-path">{{ entry.fullPath }}</span>
        </div>
        <div v-if="!filteredMethods.length" class="ab-hint" style="padding:8px 0">No methods</div>
      </div>
    </aside>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, h } from 'vue'
import { BLOCK_PALETTE } from './types'
import type { BlockType, AppBlock } from './types'
import { useAppBuilder } from './useAppBuilder'
import { generateProject, writeProjectToDisk } from './useProjectCodegen'
import { useBackends } from '../../lib/useBackends'
import { registerAction } from '../../lib/useActionRegistry'
import type { MethodEntry } from '../../components/CommandPalette.vue'
import ClaudeChat from './ClaudeChat.vue'

const {
  project, activePageId, activePage, selectedBlockId, selectedBlock,
  setProjectName, setBackend, syncBackends, resetProject,
  addPage, deletePage, setActivePage, renamePage,
  addBlock, deleteBlock, moveBlockUp, moveBlockDown,
  updateBlockProp, setBlockType, setBlockBinding, setBlockVarName,
} = useAppBuilder()

const { connections, methodIndex } = useBackends()

const centerMode = ref<'design' | 'code' | 'claude'>('design')
const bindQuery  = ref('')

// ─── Auto-sync backends ────────────────────────────────────────────────────────

onMounted(() => { syncBackends(connections.value) })

// ─── Write / download project ─────────────────────────────────────────────────

async function writeProject() {
  try {
    await writeProjectToDisk(project)
  } catch (e: unknown) {
    if (e instanceof Error && e.name !== 'AbortError') alert('Write failed: ' + e.message)
  }
}

// ─── Page helpers ─────────────────────────────────────────────────────────────

function toPascal(s: string): string {
  return s.split(/\s+|[-_]/).map(w => w[0]?.toUpperCase() + w.slice(1)).join('') + 'Page'
}
function toRoute(s: string): string {
  return '/' + s.toLowerCase().replace(/\s+/g, '-').replace(/^-|-$/g, '')
}

function addBlockToActivePage(type: BlockType) {
  const pageId = activePageId.value
  if (pageId) addBlock(pageId, type)
}

function confirmReset() {
  if (confirm('Reset the project? All pages and blocks will be lost.')) resetProject()
}

// ─── Block preview ────────────────────────────────────────────────────────────

function previewComponent(block: AppBlock) {
  const bound = !!block.binding
  switch (block.type) {
    case 'heading': return h(`h${block.props.level ?? 2}`, { class: 'ab-prev-heading' },
      bound ? `[bound: ${block.binding!.backend}.${block.binding!.method}]` : (block.props.label ?? 'Heading'))
    case 'text':    return h('p',  { class: 'ab-prev-text' },
      bound ? `[bound: ${block.binding!.backend}.${block.binding!.method}]` : (block.props.label ?? 'Text'))
    case 'list':    return h('div', { class: 'ab-prev-list' },
      bound ? `[ list ← ${block.binding!.backend}.${block.binding!.method} ]` : '[ empty list ]')
    case 'button':  return h('button', { class: 'ab-prev-btn', disabled: true }, block.props.label ?? 'Click me')
    case 'form':    return h('div',    { class: 'ab-prev-form' }, `⊞ form → ${bound ? block.binding!.method : 'unbound'}`)
    case 'stream':  return h('div',    { class: 'ab-prev-stream' },
      bound ? `~ stream ← ${block.binding!.backend}.${block.binding!.method}` : (block.props.placeholder ?? 'Waiting…'))
    case 'json':    return h('div',    { class: 'ab-prev-json' },
      bound ? `{} json ← ${block.binding!.backend}.${block.binding!.method}` : '{}')
  }
}

function previewProps(_block: AppBlock): Record<string, unknown> { return {} }

// ─── Code view ────────────────────────────────────────────────────────────────

const codeTabs = computed(() => {
  const tabs: { path: string; label: string }[] = []
  if (activePage.value) tabs.push({ path: `src/pages/${activePage.value.name}.vue`, label: `${activePage.value.name}.vue` })
  tabs.push(
    { path: 'src/lib/plexus.ts',  label: 'plexus.ts' },
    { path: 'src/router/index.ts', label: 'router.ts' },
    { path: 'src/App.vue',        label: 'App.vue' },
    { path: 'package.json',       label: 'package.json' },
  )
  return tabs
})

const codeTab = ref(codeTabs.value[0]?.path ?? '')

const currentCodeContent = computed(() => {
  const files = generateProject(project)
  return files[codeTab.value] ?? ''
})

// ─── Method binding ───────────────────────────────────────────────────────────

const filteredMethods = computed<MethodEntry[]>(() => {
  const q = bindQuery.value.toLowerCase()
  if (!q) return methodIndex.value.slice(0, 50)
  return methodIndex.value
    .filter(e => e.fullPath.toLowerCase().includes(q))
    .slice(0, 50)
})

function bindMethod(entry: MethodEntry) {
  if (!selectedBlock.value) return
  const method = entry.callPath ?? (
    entry.path.length === 0 ? entry.method.name : `${entry.path.join('.')}.${entry.method.name}`
  )
  setBlockBinding(selectedBlock.value.id, {
    backend: entry.backend,
    method,
    params:  {},
  })
  // Auto-set varName from method
  const parts = method.split('.')
  const varName = parts.map((p, i) => i === 0 ? p : p[0]!.toUpperCase() + p.slice(1)).join('')
  setBlockVarName(selectedBlock.value.id, varName)
}

const BK_COLORS = ['var(--accent)', 'var(--green)', 'var(--yellow)', '#bc8cff', '#ff7b72', 'var(--accent-2)']
const bkColorMap = new Map<string, string>()
let bkColorIdx = 0
function bkColor(name: string): string {
  if (!bkColorMap.has(name)) bkColorMap.set(name, BK_COLORS[bkColorIdx++ % BK_COLORS.length]!)
  return bkColorMap.get(name)!
}

// ─── Action registry ──────────────────────────────────────────────────────────

const cleanups: (() => void)[] = []
function reg(key: string, fn: (p: Record<string, unknown>) => unknown) {
  cleanups.push(registerAction(key, fn))
}

onMounted(() => {
  reg('app.getState',      ()                     => JSON.parse(JSON.stringify(project)))
  reg('app.setName',       ({ name })             => { setProjectName(name as string); return { ok: true } })
  reg('app.setBackend',    ({ name, url })        => { setBackend(name as string, url as string); return { ok: true } })
  reg('app.reset',         ()                     => { resetProject(); return { ok: true } })
  reg('app.generateCode',  ()                     => ({ files: generateProject(project) }))
  reg('app.addPage',       ()                     => { const p = addPage(); return { id: p.id } })
  reg('app.deletePage',    ({ pageId })           => { deletePage(pageId as string); return { ok: true } })
  reg('app.setActivePage', ({ pageId })           => { setActivePage(pageId as string); return { ok: true } })
  reg('app.renamePage',    ({ pageId, title, name, route }) => {
    renamePage(pageId as string, title as string, name as string | undefined, route as string | undefined)
    return { ok: true }
  })
  reg('app.addBlock',      ({ pageId, type })     => { const b = addBlock(pageId as string, type as BlockType); return { id: b.id } })
  reg('app.deleteBlock',   ({ blockId })          => { deleteBlock(blockId as string); return { ok: true } })
  reg('app.moveBlockUp',   ({ blockId })          => { moveBlockUp(blockId as string); return { ok: true } })
  reg('app.moveBlockDown', ({ blockId })          => { moveBlockDown(blockId as string); return { ok: true } })
  reg('app.updateBlockProp', ({ blockId, key, value }) => { updateBlockProp(blockId as string, key as string, value); return { ok: true } })
  reg('app.setBlockBinding', ({ blockId, binding }) => { setBlockBinding(blockId as string, binding as import('./types').BlockBinding | null); return { ok: true } })
})

onUnmounted(() => { cleanups.forEach(fn => fn()) })
</script>

<style scoped>
.app-builder {
  display: flex;
  flex: 1;
  min-width: 0;
  height: 100%;
  overflow: hidden;
  background: var(--bg-0);
}

/* ── Left panel ─────────────────────────────────────────────── */
.ab-left {
  width: 180px;
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  background: var(--bg-2);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: 8px 0 6px;
  gap: 1px;
}

.ab-section-hdr {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-dim);
  padding: 4px 12px 2px;
}
.ab-hdr-btn {
  background: none; border: none; color: var(--text-dim); cursor: pointer;
  font-size: 14px; line-height: 1; padding: 0 2px;
}
.ab-hdr-btn:hover { color: var(--text-2); }

.ab-field {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 2px 10px;
}
.ab-field label { font-size: 10px; color: var(--text-dim); }
.ab-input {
  background: var(--bg-3); border: 1px solid var(--border); border-radius: 4px;
  color: var(--text-2); font-size: 11px; padding: 4px 7px; outline: none; font-family: inherit;
  width: 100%; box-sizing: border-box;
}
.ab-input:focus { border-color: var(--accent); }
.ab-input-sm { font-size: 10px; padding: 3px 6px; }
.ab-hint { font-size: 10px; color: var(--text-dim); padding: 2px 12px; }

.ab-page-list { display: flex; flex-direction: column; gap: 1px; padding: 2px 6px; }
.ab-page-row {
  display: flex; align-items: center; gap: 4px; padding: 5px 8px; border-radius: 4px;
  cursor: pointer; font-size: 11px; color: var(--text-muted);
}
.ab-page-row:hover   { background: var(--bg-3); }
.ab-page-row.active  { background: var(--accent-bg); color: var(--text-2); }
.ab-page-route { font-size: 10px; color: var(--accent); flex-shrink: 0; }
.ab-page-name  { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ab-page-del   { background: none; border: none; color: var(--text-dim); cursor: pointer; font-size: 11px; padding: 0 2px; opacity: 0; }
.ab-page-row:hover .ab-page-del { opacity: 1; }
.ab-page-del:hover { color: var(--red); }

.ab-left-spacer { flex: 1; }

.ab-palette-item {
  display: flex; align-items: center; gap: 8px; padding: 5px 12px;
  cursor: pointer; font-size: 12px; color: var(--text-muted);
  background: none; border: none; text-align: left; font-family: inherit;
  transition: background 0.08s, color 0.08s; border-radius: 3px; margin: 0 4px;
}
.ab-palette-item:hover { background: var(--accent-bg); color: var(--text-2); }
.ab-palette-icon { font-size: 13px; width: 18px; text-align: center; color: var(--accent); }
.ab-palette-label { font-size: 11px; }

.ab-palette-sep { height: 1px; background: var(--border); margin: 6px 10px; }
.ab-danger-btn {
  margin: 4px 10px; padding: 5px 10px; background: none; border: 1px solid var(--border);
  border-radius: 4px; cursor: pointer; font-size: 11px; color: var(--text-dim); font-family: inherit;
}
.ab-danger-btn:hover { border-color: var(--red); color: var(--red); }

/* ── Center ──────────────────────────────────────────────────── */
.ab-center {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.ab-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-1);
  flex-shrink: 0;
}

.ab-page-meta { display: flex; align-items: center; gap: 6px; }
.ab-toolbar-input {
  background: var(--bg-3); border: 1px solid var(--border); border-radius: 4px;
  color: var(--text-2); font-size: 12px; padding: 4px 8px; outline: none; font-family: inherit;
}
.ab-toolbar-input:focus { border-color: var(--accent); }
.ab-toolbar-route { width: 120px; color: var(--accent); }
.ab-sep { color: var(--text-dim); }
.ab-toolbar-spacer { flex: 1; }
.ab-mode-toggle { display: flex; gap: 2px; }
.ab-mode-btn {
  padding: 4px 10px; background: none; border: 1px solid var(--border); border-radius: 4px;
  cursor: pointer; font-size: 11px; color: var(--text-dim); font-family: inherit;
}
.ab-mode-btn:hover  { background: var(--bg-3); color: var(--text-2); }
.ab-mode-btn.active { background: var(--accent-bg); color: var(--accent); border-color: var(--accent); }
.ab-mode-claude     { font-weight: 600; }
.ab-mode-claude.active { background: color-mix(in srgb, var(--accent) 12%, transparent); color: var(--accent); }
.ab-write-btn {
  padding: 4px 10px; background: var(--accent); color: #fff; border: none; border-radius: 4px;
  cursor: pointer; font-size: 11px; font-family: inherit; font-weight: 600;
}
.ab-write-btn:hover { opacity: 0.88; }

/* Design canvas */
.ab-canvas {
  flex: 1; overflow-y: auto; padding: 24px 32px; display: flex; flex-direction: column; gap: 12px;
}
.ab-empty {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
  color: var(--text-dim); font-size: 13px; gap: 6px;
}
.ab-empty p { margin: 0; }
.ab-empty-hint { font-size: 11px; }

.ab-block {
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-1);
  cursor: pointer;
  transition: border-color 0.1s;
}
.ab-block:hover  { border-color: var(--border-2); }
.ab-block.selected { border-color: var(--accent); }

.ab-block-bar {
  display: flex; align-items: center; gap: 8px; padding: 6px 10px;
  border-bottom: 1px solid var(--border); font-size: 11px;
  background: var(--bg-2); border-radius: 5px 5px 0 0;
}
.ab-block-type { font-weight: 600; color: var(--accent); text-transform: uppercase; font-size: 9px; letter-spacing: 0.06em; }
.ab-block-binding { color: var(--text-muted); }
.ab-block-bk     { color: var(--green); font-weight: 600; }
.ab-block-method { color: var(--text-2); }
.ab-block-unbound { color: var(--text-dim); font-style: italic; }
.ab-block-actions { margin-left: auto; display: flex; gap: 2px; }
.ab-blk-btn {
  background: none; border: none; color: var(--text-dim); cursor: pointer; font-size: 12px; padding: 1px 4px; border-radius: 3px;
}
.ab-blk-btn:hover { background: var(--bg-3); color: var(--text-2); }
.ab-blk-del:hover { color: var(--red) !important; }

.ab-block-preview {
  padding: 12px 14px; font-size: 13px; color: var(--text-2); font-family: system-ui, sans-serif; min-height: 32px;
}
.ab-prev-heading { margin: 0; font-size: 1.3rem; font-weight: 700; color: var(--text-2); }
.ab-prev-text { margin: 0; color: var(--text-muted); line-height: 1.6; }
.ab-prev-list { color: var(--text-dim); font-size: 12px; padding: 4px 8px; background: var(--bg-2); border-radius: 4px; }
.ab-prev-btn { background: #2563eb; color: #fff; border: none; border-radius: 4px; padding: 6px 16px; font-size: 12px; cursor: default; }
.ab-prev-form { color: var(--text-dim); font-size: 12px; }
.ab-prev-stream { color: var(--text-dim); font-size: 12px; white-space: pre-wrap; }
.ab-prev-json { color: var(--accent); font-family: monospace; font-size: 12px; }

/* Code view */
.ab-claude-panel { flex: 1; min-width: 0; overflow: hidden; }
.ab-code-view { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.ab-code-tabs {
  display: flex; gap: 2px; padding: 6px 12px 0; border-bottom: 1px solid var(--border);
  background: var(--bg-1); flex-shrink: 0; overflow-x: auto; flex-wrap: nowrap;
}
.ab-code-tab {
  padding: 5px 12px; background: none; border: none; border-bottom: 2px solid transparent;
  cursor: pointer; font-size: 11px; color: var(--text-dim); font-family: monospace; white-space: nowrap;
}
.ab-code-tab:hover  { color: var(--text-2); }
.ab-code-tab.active { color: var(--accent); border-bottom-color: var(--accent); }
.ab-code-pre {
  flex: 1; margin: 0; overflow: auto; padding: 16px 20px;
  font-family: 'Berkeley Mono', 'Fira Code', 'Cascadia Code', ui-monospace, monospace;
  font-size: 12px; line-height: 1.6; color: var(--text-2); background: var(--bg-0);
  white-space: pre; tab-size: 2;
}

/* ── Right config panel ──────────────────────────────────────── */
.ab-right {
  width: 220px;
  flex-shrink: 0;
  border-left: 1px solid var(--border);
  background: var(--bg-2);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: 8px 0;
  gap: 2px;
}

.ab-block-id { font-size: 9px; color: var(--text-dim); font-family: monospace; }

.ab-select {
  background: var(--bg-3); border: 1px solid var(--border); border-radius: 4px;
  color: var(--text-2); font-size: 11px; padding: 4px 6px; outline: none; font-family: inherit;
  width: 100%; box-sizing: border-box;
}
.ab-select:focus { border-color: var(--accent); }

.ab-textarea {
  background: var(--bg-3); border: 1px solid var(--border); border-radius: 4px;
  color: var(--text-2); font-size: 11px; padding: 4px 7px; outline: none; font-family: inherit;
  width: 100%; box-sizing: border-box; resize: vertical; min-height: 48px;
}
.ab-textarea:focus { border-color: var(--accent); }

.ab-binding-current {
  display: flex; align-items: center; gap: 6px; padding: 4px 10px; font-size: 11px;
  background: var(--accent-bg); border-radius: 4px; margin: 0 8px;
}
.ab-bk-badge { color: var(--green); font-weight: 600; font-size: 10px; flex-shrink: 0; }
.ab-binding-current code { flex: 1; color: var(--text-2); font-size: 10px; overflow: hidden; text-overflow: ellipsis; }
.ab-clear-binding { background: none; border: none; color: var(--text-dim); cursor: pointer; font-size: 11px; flex-shrink: 0; }
.ab-clear-binding:hover { color: var(--red); }

.ab-bind-search { margin: 4px 10px 2px; width: calc(100% - 20px); box-sizing: border-box; }

.ab-method-list { display: flex; flex-direction: column; overflow-y: auto; max-height: 280px; padding: 0 6px; }
.ab-method-row {
  display: flex; align-items: center; gap: 5px; padding: 5px 8px; border-radius: 4px;
  cursor: pointer; font-size: 10px; font-family: monospace;
}
.ab-method-row:hover  { background: var(--bg-3); }
.ab-method-row.active { background: var(--accent-bg); }
.ab-method-bk   { font-size: 9px; font-weight: 700; flex-shrink: 0; letter-spacing: 0.03em; }
.ab-method-path { color: var(--text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
