import { serve } from '@plexus/rpc'
import { setBridgeWs, clearBridgeWs, handleBridgeMessage } from './bridge-connection'
import { plexusGammaPlugin } from './plugins'
import type { BridgeMessage } from './bridge'

type BridgeWs = import('bun').ServerWebSocket<{ role: 'bridge' | 'client'; id?: string }>

serve('plexus-gamma', {
  port: 44707,

  // Intercept /bridge path — tag the socket so open/message/close route to bridge handlers
  onUpgrade(req, upgrade) {
    const url = new URL(req.url)
    if (url.pathname !== '/bridge') return false
    return upgrade('bridge')
  },

  onCustomOpen(ws) {
    setBridgeWs(ws as BridgeWs)
  },

  onCustomMessage(_, raw) {
    const text = typeof raw === 'string' ? raw : raw.toString()
    let msg: unknown
    try { msg = JSON.parse(text) } catch { return }
    handleBridgeMessage(msg as BridgeMessage)
  },

  onCustomClose() {
    clearBridgeWs()
  },
}, plexusGammaPlugin)
