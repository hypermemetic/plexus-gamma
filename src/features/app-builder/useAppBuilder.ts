/**
 * Module-level app builder state.
 * Persisted to localStorage under 'plexus-gamma:app'.
 */

import { ref, reactive, computed, watch } from 'vue'
import type { AppProject, AppPage, AppBlock, BlockType, BlockBinding } from './types'
import { newProject, newPage, newBlock } from './types'

const STORAGE_KEY = 'plexus-gamma:app'

function load(): AppProject {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const p = JSON.parse(raw) as AppProject
      if (Array.isArray(p.pages) && p.pages.length) return p
    }
  } catch { /* ignore */ }
  return newProject()
}

// ─── State ────────────────────────────────────────────────────────────────────

const project        = reactive<AppProject>(load())
const activePageId   = ref<string>(project.pages[0]?.id ?? '')
const selectedBlockId = ref<string | null>(null)

watch(() => JSON.stringify(project), raw => {
  try { localStorage.setItem(STORAGE_KEY, raw) } catch { /* ignore */ }
}, { deep: true })

// ─── Derived ──────────────────────────────────────────────────────────────────

const activePage = computed<AppPage | null>(
  () => project.pages.find(p => p.id === activePageId.value) ?? null
)

const selectedBlock = computed<AppBlock | null>(() => {
  if (!selectedBlockId.value) return null
  for (const page of project.pages) {
    const b = page.blocks.find(b => b.id === selectedBlockId.value)
    if (b) return b
  }
  return null
})

// ─── Project actions ──────────────────────────────────────────────────────────

export function setProjectName(name: string): void {
  project.name = name
  project.packageName = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function setBackend(name: string, url: string): void {
  if (!project.backends) project.backends = {}
  project.backends[name] = url
}

export function syncBackends(conns: ReadonlyArray<{ readonly name: string; readonly url: string }>): void {
  if (!project.backends) project.backends = {}
  for (const c of conns) {
    if (!(c.name in project.backends)) project.backends[c.name] = c.url
  }
}

export function resetProject(): void {
  const fresh = newProject()
  Object.assign(project, fresh)
  activePageId.value = fresh.pages[0]?.id ?? ''
  selectedBlockId.value = null
}

// ─── Page actions ─────────────────────────────────────────────────────────────

export function addPage(): AppPage {
  const page = newPage(project.pages.length)
  project.pages.push(page)
  activePageId.value = page.id
  return page
}

export function deletePage(pageId: string): void {
  const idx = project.pages.findIndex(p => p.id === pageId)
  if (idx === -1 || project.pages.length <= 1) return
  project.pages.splice(idx, 1)
  if (activePageId.value === pageId) activePageId.value = project.pages[0]?.id ?? ''
}

export function setActivePage(pageId: string): void {
  if (project.pages.some(p => p.id === pageId)) activePageId.value = pageId
}

export function renamePage(pageId: string, title: string, name?: string, route?: string): void {
  const page = project.pages.find(p => p.id === pageId)
  if (!page) return
  page.title = title
  if (name)  page.name  = name
  if (route) page.route = route
}

// ─── Block actions ────────────────────────────────────────────────────────────

export function addBlock(pageId: string, type: BlockType): AppBlock {
  const page = project.pages.find(p => p.id === pageId)
  if (!page) throw new Error('page not found')
  const block = newBlock(type)
  page.blocks.push(block)
  selectedBlockId.value = block.id
  return block
}

export function deleteBlock(blockId: string): void {
  for (const page of project.pages) {
    const idx = page.blocks.findIndex(b => b.id === blockId)
    if (idx !== -1) {
      page.blocks.splice(idx, 1)
      if (selectedBlockId.value === blockId) selectedBlockId.value = null
      return
    }
  }
}

export function moveBlockUp(blockId: string): void {
  for (const page of project.pages) {
    const idx = page.blocks.findIndex(b => b.id === blockId)
    if (idx > 0) { const [b] = page.blocks.splice(idx, 1); page.blocks.splice(idx - 1, 0, b!); return }
  }
}

export function moveBlockDown(blockId: string): void {
  for (const page of project.pages) {
    const idx = page.blocks.findIndex(b => b.id === blockId)
    if (idx !== -1 && idx < page.blocks.length - 1) { const [b] = page.blocks.splice(idx, 1); page.blocks.splice(idx + 1, 0, b!); return }
  }
}

export function updateBlockProp(blockId: string, key: string, value: unknown): void {
  for (const page of project.pages) {
    const b = page.blocks.find(b => b.id === blockId)
    if (b) { b.props[key] = value; return }
  }
}

export function setBlockType(blockId: string, type: BlockType): void {
  for (const page of project.pages) {
    const b = page.blocks.find(b => b.id === blockId)
    if (b) { b.type = type; return }
  }
}

export function setBlockBinding(blockId: string, binding: BlockBinding | null): void {
  for (const page of project.pages) {
    const b = page.blocks.find(b => b.id === blockId)
    if (b) { b.binding = binding; return }
  }
}

export function setBlockVarName(blockId: string, varName: string): void {
  for (const page of project.pages) {
    const b = page.blocks.find(b => b.id === blockId)
    if (b) { b.varName = varName; return }
  }
}

// ─── Composable ───────────────────────────────────────────────────────────────

export function useAppBuilder() {
  return {
    project,
    activePageId,
    activePage,
    selectedBlockId,
    selectedBlock,
    // project
    setProjectName, setBackend, syncBackends, resetProject,
    // page
    addPage, deletePage, setActivePage, renamePage,
    // block
    addBlock, deleteBlock, moveBlockUp, moveBlockDown,
    updateBlockProp, setBlockType, setBlockBinding, setBlockVarName,
  }
}
