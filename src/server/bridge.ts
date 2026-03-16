import type { PlexusStreamItem } from '../lib/plexus/types'

// Server → Browser
export type BridgeCall = {
  type: 'call'
  callId: string
  method: string
  params: unknown
}

// Browser → Server
export type BridgeMessage =
  | { type: 'ready' }
  | { type: 'item';  callId: string; item: PlexusStreamItem }
  | { type: 'done';  callId: string }
  | { type: 'error'; callId: string; message: string }
