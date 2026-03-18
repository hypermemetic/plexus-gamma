/**
 * Action registry — a module-level bus for RPC-dispatchable component actions.
 *
 * Components register handlers when mounted and deregister on unmount.
 * useDispatch calls `callRegisteredAction` to invoke component-owned actions
 * (e.g. wiring canvas manipulation, orchestration workflow control).
 *
 * Handler return type: a plain value (sync or async). The caller wraps it in a
 * stream item. If the action is not registered (component not mounted), an
 * error is returned.
 */

type ActionFn = (params: Record<string, unknown>) => unknown | Promise<unknown>

const registry = new Map<string, ActionFn>()

/** Register a handler for `key`. Returns a cleanup function that removes it. */
export function registerAction(key: string, fn: ActionFn): () => void {
  registry.set(key, fn)
  return () => { if (registry.get(key) === fn) registry.delete(key) }
}

/** Call a registered action. Throws if not registered. */
export async function callRegisteredAction(
  key: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  const fn = registry.get(key)
  if (!fn) throw new Error(`Action not available: ${key} (component not mounted)`)
  return fn(params)
}

/** Check if an action is currently registered. */
export function hasAction(key: string): boolean {
  return registry.has(key)
}
