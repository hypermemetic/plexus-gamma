/**
 * Site builder data model.
 *
 * A Site is a list of Pages. Each Page contains positioned ComponentInstances.
 * ComponentInstances can have MethodBindings that wire their data to plexus-rpc methods.
 */

// ─── Component palette types ─────────────────────────────────────────────────

export type ComponentType =
  | 'text'      // static text or method-bound string
  | 'heading'   // h1-h3
  | 'list'      // array from a list method — renders rows
  | 'button'    // invokes a method on click
  | 'form'      // params form + submit invokes method
  | 'stream'    // streaming text (LLM output)
  | 'json'      // raw JSON viewer

export interface ComponentMeta {
  type:        ComponentType
  label:       string
  icon:        string
  description: string
  defaultW:    number
  defaultH:    number
}

export const COMPONENT_PALETTE: ComponentMeta[] = [
  { type: 'text',    label: 'Text',    icon: 'T',  description: 'Static or method-bound text block', defaultW: 320, defaultH: 80  },
  { type: 'heading', label: 'Heading', icon: 'H',  description: 'Page or section heading',           defaultW: 400, defaultH: 56  },
  { type: 'list',    label: 'List',    icon: '≡',  description: 'List of items from a method',       defaultW: 400, defaultH: 240 },
  { type: 'button',  label: 'Button',  icon: '▶',  description: 'Invokes a method on click',         defaultW: 160, defaultH: 44  },
  { type: 'form',    label: 'Form',    icon: '⊞',  description: 'Param form + method invocation',    defaultW: 380, defaultH: 300 },
  { type: 'stream',  label: 'Stream',  icon: '~',  description: 'Streaming output (LLM / chat)',     defaultW: 480, defaultH: 320 },
  { type: 'json',    label: 'JSON',    icon: '{}', description: 'Raw JSON response viewer',          defaultW: 360, defaultH: 240 },
]

// ─── Method binding ───────────────────────────────────────────────────────────

export interface MethodBinding {
  backend:      string                      // e.g. "substrate"
  method:       string                      // e.g. "cone.list"
  staticParams: Record<string, unknown>     // hardcoded params
}

// ─── Component props per type ─────────────────────────────────────────────────

export interface TextProps      { content: string; fontSize: number; color: string; align: 'left'|'center'|'right' }
export interface HeadingProps   { content: string; level: 1|2|3; color: string; align: 'left'|'center'|'right' }
export interface ListProps      { labelField: string; emptyText: string }
export interface ButtonProps    { label: string; variant: 'primary'|'secondary'|'ghost' }
export interface FormProps      { submitLabel: string; showResult: boolean }
export interface StreamProps    { placeholder: string; maxHeight: number }
export interface JsonProps      { collapsed: boolean }

export type ComponentProps =
  | { type: 'text';    props: TextProps }
  | { type: 'heading'; props: HeadingProps }
  | { type: 'list';    props: ListProps }
  | { type: 'button';  props: ButtonProps }
  | { type: 'form';    props: FormProps }
  | { type: 'stream';  props: StreamProps }
  | { type: 'json';    props: JsonProps }

// ─── Component instance ───────────────────────────────────────────────────────

export interface ComponentInstance {
  id:      string
  type:    ComponentType
  x:       number
  y:       number
  width:   number
  height:  number
  binding: MethodBinding | null
  props:   Record<string, unknown>
}

// ─── Page / Site ──────────────────────────────────────────────────────────────

export interface Page {
  id:         string
  slug:       string           // url path (e.g. "/", "/about")
  title:      string
  background: string           // css color
  components: ComponentInstance[]
}

export interface Site {
  name:         string
  backendUrl:   string         // ws:// URL to connect to at runtime
  pages:        Page[]
  globalStyles: string
}

// ─── Default factory helpers ──────────────────────────────────────────────────

export function defaultProps(type: ComponentType): Record<string, unknown> {
  switch (type) {
    case 'text':    return { content: 'Text block', fontSize: 14, color: 'inherit', align: 'left' }
    case 'heading': return { content: 'Heading', level: 1, color: 'inherit', align: 'left' }
    case 'list':    return { labelField: 'name', emptyText: 'No items' }
    case 'button':  return { label: 'Click me', variant: 'primary' }
    case 'form':    return { submitLabel: 'Submit', showResult: true }
    case 'stream':  return { placeholder: 'Waiting for stream…', maxHeight: 300 }
    case 'json':    return { collapsed: false }
  }
}

export function newComponent(type: ComponentType, x: number, y: number): ComponentInstance {
  const meta = COMPONENT_PALETTE.find(m => m.type === type)!
  return {
    id:      crypto.randomUUID(),
    type,
    x,
    y,
    width:   meta.defaultW,
    height:  meta.defaultH,
    binding: null,
    props:   defaultProps(type),
  }
}

export function newSite(): Site {
  return {
    name:         'My Site',
    backendUrl:   'ws://127.0.0.1:4444',
    globalStyles: '',
    pages: [{
      id:         crypto.randomUUID(),
      slug:       '/',
      title:      'Home',
      background: '#ffffff',
      components: [],
    }],
  }
}
