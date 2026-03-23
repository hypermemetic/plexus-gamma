/**
 * Site builder data model — section-based layout.
 *
 * A Site contains Pages. Each Page has Sections (rows). Each Section has
 * Columns (CSS grid cells). Each Column contains SiteElements.
 *
 * SiteElements can be bound to plexus-rpc methods for live data.
 */

// ─── Element palette types ────────────────────────────────────────────────────

export type ElementType =
  | 'text'    // static text or method-bound string
  | 'heading' // h1-h3
  | 'list'    // array from a list method — renders rows
  | 'button'  // invokes a method on click
  | 'form'    // params form + submit invokes method
  | 'stream'  // streaming text (LLM output)
  | 'json'    // raw JSON viewer
  | 'divider' // horizontal rule
  | 'spacer'  // vertical space

export interface ElementMeta {
  type:        ElementType
  label:       string
  icon:        string
  description: string
}

export const ELEMENT_PALETTE: ElementMeta[] = [
  { type: 'heading', label: 'Heading', icon: 'H',  description: 'Page or section heading' },
  { type: 'text',    label: 'Text',    icon: 'T',  description: 'Static or bound paragraph' },
  { type: 'list',    label: 'List',    icon: '≡',  description: 'List of items from a method' },
  { type: 'button',  label: 'Button',  icon: '▶',  description: 'Invokes a method on click' },
  { type: 'form',    label: 'Form',    icon: '⊞',  description: 'Param form + method invocation' },
  { type: 'stream',  label: 'Stream',  icon: '~',  description: 'Streaming output (LLM / chat)' },
  { type: 'json',    label: 'JSON',    icon: '{}', description: 'Raw JSON response viewer' },
  { type: 'divider', label: 'Divider', icon: '─',  description: 'Horizontal rule' },
  { type: 'spacer',  label: 'Spacer',  icon: '↕',  description: 'Vertical spacing' },
]

// ─── Method binding ───────────────────────────────────────────────────────────

export interface MethodBinding {
  backend:      string                      // e.g. "substrate"
  method:       string                      // e.g. "cone.list"
  staticParams: Record<string, unknown>     // hardcoded params
}

// ─── Element ──────────────────────────────────────────────────────────────────

export interface SiteElement {
  id:      string
  type:    ElementType
  binding: MethodBinding | null
  props:   Record<string, unknown>
}

// ─── Column (grid cell) ───────────────────────────────────────────────────────

export interface SiteColumn {
  id:       string
  span:     number            // 1–12 in a 12-column grid
  elements: SiteElement[]
}

// ─── Section (row) ────────────────────────────────────────────────────────────

export interface SiteSection {
  id:         string
  columns:    SiteColumn[]
  background: string          // css color or 'transparent'
  paddingY:   number          // vertical padding in px
}

// ─── Page / Site ──────────────────────────────────────────────────────────────

export interface Page {
  id:       string
  slug:     string            // url path (e.g. "/", "/about")
  title:    string
  sections: SiteSection[]
}

export interface Site {
  name:         string
  backendUrl:   string        // ws:// URL to connect to at runtime
  pages:        Page[]
  globalStyles: string
}

// ─── Default props per element type ──────────────────────────────────────────

export function defaultProps(type: ElementType): Record<string, unknown> {
  switch (type) {
    case 'text':    return { content: 'Your text here', fontSize: 16, color: 'inherit', align: 'left' }
    case 'heading': return { content: 'Section Heading', level: 2, color: 'inherit', align: 'left' }
    case 'list':    return { labelField: 'name', emptyText: 'No items' }
    case 'button':  return { label: 'Click me', variant: 'primary' }
    case 'form':    return { submitLabel: 'Submit', showResult: true }
    case 'stream':  return { placeholder: 'Waiting for stream…', maxHeight: 300 }
    case 'json':    return { collapsed: false }
    case 'divider': return { color: '#e5e7eb', thickness: 1, margin: 8 }
    case 'spacer':  return { height: 48 }
  }
}

// ─── Factory helpers ──────────────────────────────────────────────────────────

export function newElement(type: ElementType): SiteElement {
  return { id: crypto.randomUUID(), type, binding: null, props: defaultProps(type) }
}

export function newColumn(span = 12): SiteColumn {
  return { id: crypto.randomUUID(), span, elements: [] }
}

export function newSection(): SiteSection {
  return {
    id:         crypto.randomUUID(),
    columns:    [newColumn(12)],
    background: 'transparent',
    paddingY:   48,
  }
}

export function newPage(index: number): Page {
  return {
    id:       crypto.randomUUID(),
    slug:     index === 0 ? '/' : `/page-${index}`,
    title:    index === 0 ? 'Home' : `Page ${index}`,
    sections: [newSection()],
  }
}

export function newSite(): Site {
  return {
    name:         'My Site',
    backendUrl:   'ws://127.0.0.1:4444',
    globalStyles: '',
    pages:        [newPage(0)],
  }
}
