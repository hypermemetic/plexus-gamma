import { onMounted, onUnmounted, type Ref } from 'vue'

type Binding = (e: KeyboardEvent) => void

interface ParsedKey {
  key: string
  ctrl: boolean
  meta: boolean
  shift: boolean
  alt: boolean
  fn: Binding
}

function parseBinding(spec: string): Omit<ParsedKey, 'fn'> {
  const parts = spec.toLowerCase().split('+')
  const key = parts[parts.length - 1] ?? ''
  return {
    key,
    ctrl:  parts.includes('ctrl'),
    meta:  parts.includes('meta'),
    shift: parts.includes('shift'),
    alt:   parts.includes('alt'),
  }
}

export function useKeymap(
  bindings: Record<string, Binding>,
  opts?: { enabled?: Ref<boolean> },
): void {
  const parsed: ParsedKey[] = Object.entries(bindings).map(([k, fn]) => ({
    ...parseBinding(k),
    fn,
  }))

  function handler(e: KeyboardEvent) {
    if (opts?.enabled !== undefined && !opts.enabled.value) return
    for (const b of parsed) {
      if (
        e.key.toLowerCase() === b.key &&
        e.ctrlKey  === b.ctrl  &&
        e.metaKey  === b.meta  &&
        e.shiftKey === b.shift &&
        e.altKey   === b.alt
      ) {
        e.preventDefault()
        e.stopPropagation()
        b.fn(e)
        break
      }
    }
  }

  onMounted(()   => window.addEventListener('keydown', handler, true))
  onUnmounted(() => window.removeEventListener('keydown', handler, true))
}
