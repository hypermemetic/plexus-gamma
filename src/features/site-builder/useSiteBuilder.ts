/**
 * Module-level site builder state.
 * Persisted to localStorage under 'plexus-gamma:site'.
 *
 * All mutation functions are exported so SiteBuilder.vue can register them
 * as action-registry handlers (registerAction).
 */

import { ref, reactive, computed, watch } from 'vue'
import type { Site, Page, SiteSection, SiteColumn, SiteElement, ElementType, MethodBinding } from './types'
import { newSite, newPage, newSection, newColumn, newElement } from './types'

const STORAGE_KEY = 'plexus-gamma:site'

function loadSite(): Site {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Site
      // Validate section-based format — old builds used page.components instead of page.sections
      if (!Array.isArray(parsed.pages?.[0]?.sections)) return newSite()
      return parsed
    }
  } catch { /* ignore */ }
  return newSite()
}

// ─── State ────────────────────────────────────────────────────────────────────

const site           = reactive<Site>(loadSite())
const activePageId   = ref<string>(site.pages[0]?.id ?? '')
const selectedElementId = ref<string | null>(null)
const activeColumnId = ref<string | null>(null)   // column targeted for element insertion

// Persist on every change
watch(() => JSON.stringify(site), raw => {
  try { localStorage.setItem(STORAGE_KEY, raw) } catch { /* ignore */ }
}, { deep: true })

// ─── Derived ──────────────────────────────────────────────────────────────────

const activePage = computed<Page | null>(
  () => site.pages.find(p => p.id === activePageId.value) ?? null
)

function findElementCtx(elementId: string): { section: SiteSection; column: SiteColumn; element: SiteElement } | null {
  for (const page of site.pages) {
    for (const section of page.sections) {
      for (const column of section.columns) {
        const element = column.elements.find(e => e.id === elementId)
        if (element) return { section, column, element }
      }
    }
  }
  return null
}

const selectedElement = computed<SiteElement | null>(() => {
  if (!selectedElementId.value) return null
  return findElementCtx(selectedElementId.value)?.element ?? null
})

function findSection(sectionId: string): SiteSection | null {
  for (const page of site.pages) {
    const s = page.sections.find(s => s.id === sectionId)
    if (s) return s
  }
  return null
}

function findColumn(columnId: string): { section: SiteSection; column: SiteColumn } | null {
  for (const page of site.pages) {
    for (const section of page.sections) {
      const column = section.columns.find(c => c.id === columnId)
      if (column) return { section, column }
    }
  }
  return null
}

// ─── Page actions ─────────────────────────────────────────────────────────────

export function addPage(): Page {
  const page = newPage(site.pages.length)
  site.pages.push(page)
  activePageId.value = page.id
  return page
}

export function deletePage(pageId: string): void {
  const idx = site.pages.findIndex(p => p.id === pageId)
  if (idx === -1) return
  site.pages.splice(idx, 1)
  if (activePageId.value === pageId)
    activePageId.value = site.pages[0]?.id ?? ''
}

export function setActivePage(pageId: string): void {
  if (site.pages.some(p => p.id === pageId)) activePageId.value = pageId
}

export function renamePage(pageId: string, title: string): void {
  const page = site.pages.find(p => p.id === pageId)
  if (page) page.title = title
}

// ─── Section actions ──────────────────────────────────────────────────────────

export function addSection(afterSectionId?: string): SiteSection {
  const page = activePage.value
  if (!page) throw new Error('no active page')
  const section = newSection()
  if (afterSectionId) {
    const idx = page.sections.findIndex(s => s.id === afterSectionId)
    page.sections.splice(idx === -1 ? page.sections.length : idx + 1, 0, section)
  } else {
    page.sections.push(section)
  }
  return section
}

export function deleteSection(sectionId: string): void {
  const page = activePage.value
  if (!page) return
  const idx = page.sections.findIndex(s => s.id === sectionId)
  if (idx !== -1) page.sections.splice(idx, 1)
}

export function moveSectionUp(sectionId: string): void {
  const page = activePage.value
  if (!page) return
  const idx = page.sections.findIndex(s => s.id === sectionId)
  if (idx > 0) {
    const [sec] = page.sections.splice(idx, 1)
    page.sections.splice(idx - 1, 0, sec!)
  }
}

export function moveSectionDown(sectionId: string): void {
  const page = activePage.value
  if (!page) return
  const idx = page.sections.findIndex(s => s.id === sectionId)
  if (idx !== -1 && idx < page.sections.length - 1) {
    const [sec] = page.sections.splice(idx, 1)
    page.sections.splice(idx + 1, 0, sec!)
  }
}

export function setSectionBackground(sectionId: string, background: string): void {
  const section = findSection(sectionId)
  if (section) section.background = background
}

export function setSectionPadding(sectionId: string, paddingY: number): void {
  const section = findSection(sectionId)
  if (section) section.paddingY = paddingY
}

// ─── Column actions ───────────────────────────────────────────────────────────

function redistributeSpans(section: SiteSection): void {
  const count = section.columns.length
  if (count === 0) return
  const base = Math.floor(12 / count)
  const rem  = 12 - base * count
  section.columns.forEach((c, i) => { c.span = base + (i < rem ? 1 : 0) })
}

export function addColumn(sectionId: string): SiteColumn {
  const section = findSection(sectionId)
  if (!section) throw new Error('section not found')
  const col = newColumn(6)
  section.columns.push(col)
  redistributeSpans(section)
  return col
}

export function deleteColumn(sectionId: string, columnId: string): void {
  const section = findSection(sectionId)
  if (!section) return
  const idx = section.columns.findIndex(c => c.id === columnId)
  if (idx !== -1 && section.columns.length > 1) {
    section.columns.splice(idx, 1)
    redistributeSpans(section)
    if (activeColumnId.value === columnId) activeColumnId.value = null
  }
}

// ─── Element actions ──────────────────────────────────────────────────────────

export function addElement(sectionId: string, columnId: string, type: ElementType): SiteElement {
  const ctx = findColumn(columnId)
  if (!ctx || ctx.section.id !== sectionId) throw new Error('section/column not found')
  const element = newElement(type)
  ctx.column.elements.push(element)
  selectedElementId.value = element.id
  return element
}

export function deleteElement(elementId: string): void {
  const ctx = findElementCtx(elementId)
  if (!ctx) return
  const idx = ctx.column.elements.findIndex(e => e.id === elementId)
  if (idx !== -1) {
    ctx.column.elements.splice(idx, 1)
    if (selectedElementId.value === elementId) selectedElementId.value = null
  }
}

export function moveElementUp(elementId: string): void {
  const ctx = findElementCtx(elementId)
  if (!ctx) return
  const els = ctx.column.elements
  const idx = els.findIndex(e => e.id === elementId)
  if (idx > 0) { const [el] = els.splice(idx, 1); els.splice(idx - 1, 0, el!) }
}

export function moveElementDown(elementId: string): void {
  const ctx = findElementCtx(elementId)
  if (!ctx) return
  const els = ctx.column.elements
  const idx = els.findIndex(e => e.id === elementId)
  if (idx !== -1 && idx < els.length - 1) { const [el] = els.splice(idx, 1); els.splice(idx + 1, 0, el!) }
}

export function updateElementProp(elementId: string, key: string, value: unknown): void {
  const ctx = findElementCtx(elementId)
  if (ctx) ctx.element.props[key] = value
}

export function setElementBinding(elementId: string, binding: MethodBinding | null): void {
  const ctx = findElementCtx(elementId)
  if (ctx) ctx.element.binding = binding
}

// ─── Site-level actions ───────────────────────────────────────────────────────

export function resetSite(): void {
  const fresh = newSite()
  Object.assign(site, fresh)
  activePageId.value = fresh.pages[0]?.id ?? ''
  selectedElementId.value = null
  activeColumnId.value = null
}

export function setSiteName(name: string): void { site.name = name }
export function setBackendUrl(url: string): void { site.backendUrl = url }

// ─── Public API ───────────────────────────────────────────────────────────────

export function useSiteBuilder() {
  return {
    site,
    activePageId,
    activePage,
    selectedElementId,
    selectedElement,
    activeColumnId,
    findElementCtx,
    findSection,
    findColumn,
    // page
    addPage, deletePage, setActivePage, renamePage,
    // section
    addSection, deleteSection, moveSectionUp, moveSectionDown,
    setSectionBackground, setSectionPadding,
    // column
    addColumn, deleteColumn,
    // element
    addElement, deleteElement, moveElementUp, moveElementDown,
    updateElementProp, setElementBinding,
    // site
    resetSite, setSiteName, setBackendUrl,
  }
}
