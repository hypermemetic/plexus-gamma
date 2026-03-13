/**
 * Shared PlexusRpcClient registry.
 *
 * Returns the same client instance for a given (name, url) pair so that
 * view-switches don't tear down and rebuild WebSocket connections.
 * Components should NOT call rpc.disconnect() on unmount — the registry
 * owns the connection lifetime.
 *
 * Call releaseSharedClient() only when a backend is permanently removed.
 */
import { PlexusRpcClient } from './transport'

const clients = new Map<string, PlexusRpcClient>()

export function getSharedClient(name: string, url: string): PlexusRpcClient {
  const key = `${name}@${url}`
  let client = clients.get(key)
  if (!client) {
    client = new PlexusRpcClient({ backend: name, url })
    clients.set(key, client)
  }
  return client
}

export function releaseSharedClient(name: string, url: string): void {
  const key = `${name}@${url}`
  const client = clients.get(key)
  if (client) {
    client.disconnect()
    clients.delete(key)
  }
}
