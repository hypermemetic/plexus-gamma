import type { Ref } from 'vue'
import type { WireNode } from './wiringTypes'

/**
 * Manages the label namespace for a node graph.
 * `unique(base, excludeId?)` returns `base` if unclaimed, otherwise
 * `base2`, `base3`, … — checking each candidate against all other nodes.
 */
export function useLabelNamespace(nodes: Ref<WireNode[]>) {
  function unique(base: string, excludeId?: string): string {
    const taken = new Set(
      nodes.value
        .filter(n => n.id !== excludeId)
        .map(n => n.label)
        .filter((l): l is string => !!l)
    )
    if (!taken.has(base)) return base
    let n = 2
    while (taken.has(`${base}${n}`)) n++
    return `${base}${n}`
  }

  return { unique }
}
