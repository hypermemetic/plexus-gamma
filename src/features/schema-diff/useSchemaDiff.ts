/**
 * useSchemaDiff — polls backend hash every 3s, and when the hash changes,
 * fetches the full schema tree to compute method-level diffs (added / removed / changed).
 *
 * Returns a reactive `pendingDiff` ref that the caller can render in a banner,
 * plus `dismiss()` and `accept()` helpers.
 */

import { ref, onUnmounted } from 'vue'
import type { Ref } from 'vue'
import type { PlexusRpcClient } from '../../lib/plexus/transport'
import { collectOne } from '../../lib/plexus/rpc'
import type { PluginNode } from '../../plexus-schema'
import { flattenTree } from '../../schema-walker'

// ─── Public types ────────────────────────────────────────────────────────────

export interface MethodDiff {
  path: string            // e.g. "echo.say"
  kind: 'added' | 'removed' | 'changed'
  oldHash?: string
  newHash?: string
}

export interface SchemaDiffResult {
  backendName: string
  detectedAt: number      // Date.now()
  diffs: MethodDiff[]
}

// ─── Internal helpers ────────────────────────────────────────────────────────

/** Stable string key for a method: "namespace.methodName" */
function methodKey(nodePath: string[], methodName: string, backendName: string): string {
  const ns = nodePath.length === 0 ? backendName : nodePath.join('.')
  return `${ns}.${methodName}`
}

/** Map<fullPath, hash> from a flattened tree */
function buildMethodMap(nodes: PluginNode[], backendName: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const node of nodes) {
    for (const method of node.schema.methods) {
      const key = methodKey(node.path, method.name, backendName)
      map.set(key, method.hash)
    }
  }
  return map
}

/** Diff old vs new method maps → MethodDiff[] */
function diffMaps(
  oldMap: Map<string, string>,
  newMap: Map<string, string>,
): MethodDiff[] {
  const diffs: MethodDiff[] = []

  for (const [path, oldHash] of oldMap) {
    const newHash = newMap.get(path)
    if (newHash === undefined) {
      diffs.push({ path, kind: 'removed', oldHash })
    } else if (newHash !== oldHash) {
      diffs.push({ path, kind: 'changed', oldHash, newHash })
    }
  }

  for (const [path, newHash] of newMap) {
    if (!oldMap.has(path)) {
      diffs.push({ path, kind: 'added', newHash })
    }
  }

  // Stable sort: removed → changed → added, then alphabetical within each group
  const order: Record<MethodDiff['kind'], number> = { removed: 0, changed: 1, added: 2 }
  diffs.sort((a, b) => {
    const ko = order[a.kind] - order[b.kind]
    if (ko !== 0) return ko
    return a.path.localeCompare(b.path)
  })

  return diffs
}

/** Fetch the full schema tree and return its method map */
async function fetchMethodMap(
  rpc: PlexusRpcClient,
  backendName: string,
): Promise<Map<string, string>> {
  // We need buildTree but it's already imported as schema-walker.
  // Re-implement inline to avoid a circular-import concern and keep this
  // composable self-contained.  It only needs one RPC call per level.
  type SchemaRaw = {
    namespace: string
    methods: Array<{ name: string; hash: string }>
    children?: Array<{ namespace: string }>
  }

  async function walk(path: string[]): Promise<PluginNode[]> {
    const method = path.length === 0
      ? `${backendName}.schema`
      : `${path.join('.')}.schema`
    const schema = await collectOne<SchemaRaw>(rpc.call(method, {}))

    // Cast to the full PluginNode shape for use with flattenTree
    const node: PluginNode = {
      schema: {
        namespace: schema.namespace,
        version: '',
        description: '',
        hash: '',
        methods: schema.methods.map(m => ({
          name: m.name,
          description: '',
          hash: m.hash,
          streaming: false,
          bidirectional: false,
        })),
        children: schema.children?.map(c => ({ namespace: c.namespace, description: '', hash: '' })),
      },
      path,
      children: [],
    }

    if (schema.children) {
      const childPaths = schema.children.map(c => [...path, c.namespace])
      const childResults = await Promise.allSettled(childPaths.map(p => walk(p)))
      for (const result of childResults) {
        if (result.status === 'fulfilled') {
          for (const child of result.value) {
            node.children.push(child)
          }
        }
      }
    }

    return [node]
  }

  const nodes = await walk([])
  const allNodes = nodes.flatMap(flattenTree)
  return buildMethodMap(allNodes, backendName)
}

// ─── Composable ──────────────────────────────────────────────────────────────

export function useSchemaDiff(
  rpc: PlexusRpcClient,
  backendName: string,
  currentTree: Ref<PluginNode | null>,
): {
  pendingDiff: Ref<SchemaDiffResult | null>
  dismiss(): void
  accept(): void
} {
  const pendingDiff = ref<SchemaDiffResult | null>(null)

  let lastHash = ''
  let timer: ReturnType<typeof setInterval> | null = null

  async function pollHash(): Promise<void> {
    try {
      const result = await collectOne<Record<string, string>>(
        rpc.call(`${backendName}.hash`, {}),
      )
      const h = result['value'] ?? ''
      if (!h) return

      if (lastHash && h !== lastHash) {
        // Hash changed — compute method-level diff
        const tree = currentTree.value
        const oldMap: Map<string, string> = tree
          ? buildMethodMap(flattenTree(tree), backendName)
          : new Map()

        try {
          const newMap = await fetchMethodMap(rpc, backendName)
          const diffs = diffMaps(oldMap, newMap)

          if (diffs.length > 0) {
            pendingDiff.value = {
              backendName,
              detectedAt: Date.now(),
              diffs,
            }
          }
        } catch {
          // Schema fetch failed — surface the change without details
          pendingDiff.value = {
            backendName,
            detectedAt: Date.now(),
            diffs: [],
          }
        }
      }

      lastHash = h
    } catch {
      // Hash endpoint not supported or backend unreachable — ignore
    }
  }

  timer = setInterval(() => { void pollHash() }, 3000)

  onUnmounted(() => {
    if (timer !== null) {
      clearInterval(timer)
      timer = null
    }
  })

  function dismiss(): void {
    pendingDiff.value = null
  }

  function accept(): void {
    pendingDiff.value = null
  }

  return { pendingDiff, dismiss, accept }
}
