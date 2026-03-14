/**
 * Module-level schema tree cache.
 *
 * getCachedTree deduplicates concurrent fetches and returns the cached result
 * on subsequent calls. Call invalidateTree before re-fetching on schema change.
 */
import type { RpcClient } from './rpc'
import type { PluginNode } from '../../plexus-schema'
import { buildTree } from '../../schema-walker'

const cache   = new Map<string, PluginNode>()
const pending = new Map<string, Promise<PluginNode>>()

export async function getCachedTree(rpc: RpcClient, backendName: string): Promise<PluginNode> {
  if (cache.has(backendName)) return cache.get(backendName)!
  if (pending.has(backendName)) return pending.get(backendName)!
  const p = buildTree(rpc, backendName).then(tree => {
    cache.set(backendName, tree)
    pending.delete(backendName)
    return tree
  }).catch(err => {
    pending.delete(backendName)
    throw err
  })
  pending.set(backendName, p)
  return p
}

export function invalidateTree(backendName: string): void {
  cache.delete(backendName)
  pending.delete(backendName)
}

export function getCachedTreeSync(backendName: string): PluginNode | undefined {
  return cache.get(backendName)
}
