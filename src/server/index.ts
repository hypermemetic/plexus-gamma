import { serve } from '@plexus/rpc'
import { setBridgeWs, clearBridgeWs, handleBridgeMessage } from './bridge-connection'
import { plexusGammaPlugin } from './plugins'
import { startHeadless } from './headless'
import type { BridgeMessage } from './bridge'

await serve('plexus-gamma', {
  port: 44707,

  // Intercept /bridge path — tag the socket so open/message/close route to bridge handlers
  onUpgrade(pathname, upgrade) {
    if (pathname !== '/bridge') return false
    return upgrade('bridge')
  },

  onCustomOpen(ws) {
    setBridgeWs(ws)
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

// Start headless browser only when opted-in via HEADLESS=1.
// This keeps `bun run dev` (and Playwright tests) bridge-clean:
// the test browser or any manually-opened tab becomes the bridge client.
if (process.env['HEADLESS']) {
  const headlessUrl = process.env['HEADLESS_URL'] ?? 'http://localhost:8080'
  startHeadless(headlessUrl).catch(err => {
    console.log(`[headless] could not start browser (${headlessUrl}): ${err.message}`)
  })
}
