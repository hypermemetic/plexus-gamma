/**
 * App builder data model.
 *
 * Users design pages made of Blocks. Each Block maps to a Vue component
 * pattern (heading, list, button, form, stream, json, text).
 *
 * The builder generates a real Vite + Vue 3 + TypeScript project:
 *   src/lib/plexus.ts      — typed WebSocket RPC client
 *   src/pages/*.vue        — one SFC per page, using real typed API calls
 *   src/router/index.ts    — vue-router setup
 *   src/App.vue, main.ts   — entry points
 *   package.json, vite.config.ts, tsconfig.json, index.html
 */

export type BlockType =
  | 'heading'   // static or bound → renders <h1–3>
  | 'text'      // static or bound → renders <p>
  | 'list'      // bound array → renders <ul>/<li>
  | 'button'    // bound → calls method on click
  | 'form'      // bound → param form + submit
  | 'stream'    // bound async generator → append text
  | 'json'      // bound → raw JSON <pre>

export interface BlockBinding {
  backend: string               // e.g. "uscis"
  method:  string               // wire-protocol name, e.g. "forms.list"
  params:  Record<string, unknown>
}

export interface AppBlock {
  id:       string
  type:     BlockType
  varName:  string              // generated ts variable, e.g. "formsList"
  binding:  BlockBinding | null
  props: {
    label?:      string         // button label / heading text / static content
    level?:      1 | 2 | 3     // heading level
    listField?:  string         // which object key to display in list rows
    placeholder?: string        // stream/form placeholder
    align?:      'left' | 'center' | 'right'
    [key: string]: unknown
  }
}

export interface AppPage {
  id:     string
  name:   string   // PascalCase component name: "HomePage"
  route:  string   // Vue Router path: "/"
  title:  string   // human-readable: "Home"
  blocks: AppBlock[]
}

export interface AppProject {
  name:        string                     // display name: "My App"
  packageName: string                     // npm name: "my-app"
  backends:    Record<string, string>     // name → ws:// URL
  pages:       AppPage[]
}

// ─── Palette ──────────────────────────────────────────────────────────────────

export interface BlockMeta {
  type:        BlockType
  label:       string
  icon:        string
  description: string
}

export const BLOCK_PALETTE: BlockMeta[] = [
  { type: 'heading', label: 'Heading', icon: 'H',  description: 'Static or bound heading (h1–h3)' },
  { type: 'text',    label: 'Text',    icon: 'T',  description: 'Static or bound paragraph' },
  { type: 'list',    label: 'List',    icon: '≡',  description: 'Array from a backend method' },
  { type: 'button',  label: 'Button',  icon: '▶',  description: 'Calls a method on click' },
  { type: 'form',    label: 'Form',    icon: '⊞',  description: 'Param form + method invocation' },
  { type: 'stream',  label: 'Stream',  icon: '~',  description: 'Streaming output (LLM / chat)' },
  { type: 'json',    label: 'JSON',    icon: '{}', description: 'Raw JSON response viewer' },
]

// ─── Defaults ─────────────────────────────────────────────────────────────────

export function defaultBlockProps(type: BlockType): AppBlock['props'] {
  switch (type) {
    case 'heading': return { label: 'Section Heading', level: 2, align: 'left' }
    case 'text':    return { label: 'Your text here', align: 'left' }
    case 'list':    return { listField: 'name' }
    case 'button':  return { label: 'Click me' }
    case 'form':    return { label: 'Submit', placeholder: 'JSON params…' }
    case 'stream':  return { placeholder: 'Waiting for stream…' }
    case 'json':    return {}
  }
}

// ─── Factories ────────────────────────────────────────────────────────────────

export function newBlock(type: BlockType): AppBlock {
  return {
    id:      crypto.randomUUID(),
    type,
    varName: `${type}${Math.floor(Math.random() * 900 + 100)}`,
    binding: null,
    props:   defaultBlockProps(type),
  }
}

export function newPage(index: number): AppPage {
  return {
    id:     crypto.randomUUID(),
    name:   index === 0 ? 'HomePage' : `Page${index}`,
    route:  index === 0 ? '/' : `/page-${index}`,
    title:  index === 0 ? 'Home' : `Page ${index}`,
    blocks: [],
  }
}

export function newProject(): AppProject {
  return {
    name:        'My App',
    packageName: 'my-app',
    backends:    {},
    pages:       [newPage(0)],
  }
}
