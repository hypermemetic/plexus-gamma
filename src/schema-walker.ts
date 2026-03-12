/**
 * Activation tree walker.
 *
 * Mirrors Synapse.Algebra.Walk's schemaCoalgebra + hylomorphism, but in
 * TypeScript using the generated rpc.call primitive.
 *
 * Protocol:
 *   root schema  → rpc.call('{backendName}.schema', {})
 *   child schema → rpc.call('solar.earth.schema', {})
 *
 * The transport wraps this as: {backend}.call { method: "...", params: {} }
 */

import type { RpcClient } from './lib/plexus/rpc'
import { collectOne } from './lib/plexus/rpc'
import type { PluginSchema, PluginNode } from './plexus-schema'

/** Fetch one layer of the schema tree at the given path. */
export async function fetchSchemaAt(rpc: RpcClient, backendName: string, path: string[]): Promise<PluginSchema> {
  const method = path.length === 0
    ? `${backendName}.schema`
    : `${path.join('.')}.schema`
  return collectOne<PluginSchema>(rpc.call(method, {}))
}

/**
 * Recursively build the full activation tree starting from `path`.
 * Parallel fetches per hub level (same as hyloMPar in Haskell).
 */
export async function buildTree(rpc: RpcClient, backendName: string, path: string[] = []): Promise<PluginNode> {
  const schema = await fetchSchemaAt(rpc, backendName, path)
  const children = schema.children
    ? await Promise.all(
        schema.children.map(c => buildTree(rpc, backendName, [...path, c.namespace]))
      )
    : []
  return { schema, path, children }
}

/** Flatten a PluginNode tree into a list, depth-first. */
export function flattenTree(node: PluginNode): PluginNode[] {
  return [node, ...node.children.flatMap(flattenTree)]
}

/** Dot-joined display path, e.g. ["solar", "earth"] → "solar.earth" */
export function displayPath(path: string[], backendName: string): string {
  return path.length === 0 ? backendName : path.join('.')
}
