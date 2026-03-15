/**
 * useKeymap — generic keyboard shortcut abstraction for the wiring canvas.
 *
 * Usage:
 *   const { handleKeyDown, currentKeys, setKeys, resetKeys } = useKeymap(
 *     actionDefs,   // Record<ActionId, ActionDef>
 *     handlers,     // Partial<Record<ActionId, (e) => void>>
 *     'wiring-canvas-keys', // localStorage key for user overrides
 *   )
 *
 * Key format (canonical combo strings):
 *   Modifiers sorted: ctrl < meta < alt < shift, then key lowercased.
 *   Examples: "ctrl+z", "ctrl+shift+z", "meta+enter", "delete", "/"
 */

export interface ActionDef {
  /** Human-readable label, e.g. "Undo" */
  label: string
  /** Short description for a help dialog */
  description?: string
  /**
   * Default key combos that trigger this action.
   * Multiple combos are supported (e.g. ["ctrl+z", "meta+z"]).
   */
  defaultKeys: string[]
  /**
   * When true, this action only fires when the canvas root element is focused
   * (i.e. e.target === e.currentTarget), so it won't fire inside inputs.
   */
  requiresFocus?: boolean
}

/** Modifier order used for normalisation */
const MOD_ORDER = ['ctrl', 'meta', 'alt', 'shift'] as const

/**
 * Converts a KeyboardEvent to a canonical combo string.
 * Keys are lowercased; modifiers are sorted in MOD_ORDER.
 */
export function normalizeCombo(e: KeyboardEvent): string {
  const parts: string[] = []
  if (e.ctrlKey) parts.push('ctrl')
  if (e.metaKey) parts.push('meta')
  if (e.altKey) parts.push('alt')
  if (e.shiftKey) parts.push('shift')
  const key = e.key.toLowerCase()
  // Don't repeat the modifier as the key
  if (!MOD_ORDER.includes(key as (typeof MOD_ORDER)[number])) {
    parts.push(key)
  }
  return parts.join('+')
}

export type KeyMap<ActionId extends string> = Partial<Record<ActionId, string[]>>

export interface KeymapHandle<ActionId extends string> {
  /** Call this from the element's @keydown handler */
  handleKeyDown(e: KeyboardEvent): void
  /** Returns the current (possibly overridden) key combos for each action */
  currentKeys: KeyMap<ActionId>
  /** Override key combos for an action (persisted to localStorage if storageKey given) */
  setKeys(actionId: ActionId, combos: string[]): void
  /** Reset an action to its defaults (removes override from storage) */
  resetKeys(actionId: ActionId): void
  /** Full action definitions, useful for rendering a keybinding help panel */
  defs: Readonly<Record<ActionId, ActionDef>>
}

export function useKeymap<ActionId extends string>(
  actionDefs: Record<ActionId, ActionDef>,
  handlers: Partial<Record<ActionId, (e: KeyboardEvent) => void>>,
  storageKey?: string,
): KeymapHandle<ActionId> {
  // Load persisted overrides
  let stored: KeyMap<ActionId> = {}
  if (storageKey) {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) stored = JSON.parse(raw) as KeyMap<ActionId>
    } catch {
      // ignore corrupt storage
    }
  }

  const currentKeys: KeyMap<ActionId> = { ...stored }

  function getKeysFor(actionId: ActionId): string[] {
    return currentKeys[actionId] ?? actionDefs[actionId].defaultKeys
  }

  // Build combo → [actionId, requiresFocus] lookup (rebuilt lazily when keys change)
  let comboMap: Map<string, { id: ActionId; requiresFocus: boolean }> | null = null

  function buildComboMap() {
    comboMap = new Map()
    for (const id of Object.keys(actionDefs) as ActionId[]) {
      const def = actionDefs[id]
      for (const combo of getKeysFor(id)) {
        comboMap.set(combo, { id, requiresFocus: !!def.requiresFocus })
      }
    }
  }

  function handleKeyDown(e: KeyboardEvent): void {
    if (!comboMap) buildComboMap()
    const combo = normalizeCombo(e)
    const match = comboMap!.get(combo)
    if (!match) return
    if (match.requiresFocus && e.target !== e.currentTarget) return
    const handler = handlers[match.id]
    if (handler) {
      e.preventDefault()
      handler(e)
    }
  }

  function setKeys(actionId: ActionId, combos: string[]): void {
    currentKeys[actionId] = combos
    comboMap = null // invalidate lookup
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(currentKeys))
      } catch {
        // ignore storage errors
      }
    }
  }

  function resetKeys(actionId: ActionId): void {
    delete currentKeys[actionId]
    comboMap = null
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(currentKeys))
      } catch { /* ignore */ }
    }
  }

  return { handleKeyDown, currentKeys, setKeys, resetKeys, defs: actionDefs }
}
