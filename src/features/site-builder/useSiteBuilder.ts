/**
 * Module-level site builder state.
 * Persisted to localStorage under 'plexus-gamma:site'.
 */

import { ref, reactive, computed, watch } from 'vue'
import type { Site, Page, ComponentInstance, MethodBinding } from './types'
import { newSite, newComponent } from './types'
import type { ComponentType } from './types'

const STORAGE_KEY = 'plexus-gamma:site'

function loadSite(): Site {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as Site
  } catch { /* ignore */ }
  return newSite()
}

// ─── State ────────────────────────────────────────────────────────────────────

const site        = reactive<Site>(loadSite())
const activePageId = ref<string>(site.pages[0]?.id ?? '')
const selectedId  = ref<string | null>(null)
const dragType    = ref<ComponentType | null>(null)   // palette item being dragged

// Persist on every change
watch(() => JSON.stringify(site), raw => {
  try { localStorage.setItem(STORAGE_KEY, raw) } catch { /* ignore */ }
}, { deep: true })

// ─── Derived ─────────────────────────────────────────────────────────────────

const activePage = computed<Page | null>(
  () => site.pages.find(p => p.id === activePageId.value) ?? null
)

const selectedComponent = computed<ComponentInstance | null>(() => {
  if (!selectedId.value || !activePage.value) return null
  return activePage.value.components.find(c => c.id === selectedId.value) ?? null
})

// ─── Actions ─────────────────────────────────────────────────────────────────

function addComponent(type: ComponentType, x: number, y: number): ComponentInstance {
  const page = activePage.value
  if (!page) throw new Error('no active page')
  const component = newComponent(type, x, y)
  page.components.push(component)
  selectedId.value = component.id
  return component
}

function removeComponent(id: string): void {
  const page = activePage.value
  if (!page) return
  const idx = page.components.findIndex(c => c.id === id)
  if (idx !== -1) {
    page.components.splice(idx, 1)
    if (selectedId.value === id) selectedId.value = null
  }
}

function moveComponent(id: string, x: number, y: number): void {
  const comp = activePage.value?.components.find(c => c.id === id)
  if (!comp) return
  comp.x = Math.round(x)
  comp.y = Math.round(y)
}

function resizeComponent(id: string, width: number, height: number): void {
  const comp = activePage.value?.components.find(c => c.id === id)
  if (!comp) return
  comp.width  = Math.max(60, Math.round(width))
  comp.height = Math.max(30, Math.round(height))
}

function updateProp(id: string, key: string, value: unknown): void {
  const comp = activePage.value?.components.find(c => c.id === id)
  if (!comp) return
  comp.props[key] = value
}

function setBinding(id: string, binding: MethodBinding | null): void {
  const comp = activePage.value?.components.find(c => c.id === id)
  if (!comp) return
  comp.binding = binding
}

function resetSite(): void {
  const fresh = newSite()
  Object.assign(site, fresh)
  activePageId.value = fresh.pages[0]?.id ?? ''
  selectedId.value = null
}

function addPage(): void {
  const page: Page = {
    id:         crypto.randomUUID(),
    slug:       '/page-' + (site.pages.length + 1),
    title:      'New Page',
    background: 'var(--bg)',
    components: [],
  }
  site.pages.push(page)
  activePageId.value = page.id
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function useSiteBuilder() {
  return {
    site,
    activePageId,
    activePage,
    selectedId,
    selectedComponent,
    dragType,
    addComponent,
    removeComponent,
    moveComponent,
    resizeComponent,
    updateProp,
    setBinding,
    resetSite,
    addPage,
  }
}
