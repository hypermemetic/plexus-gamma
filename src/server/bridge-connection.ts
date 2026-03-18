import { randomUUID } from 'crypto'
import type { WebSocket } from '@plexus/rpc'
import type { PlexusStreamItem } from '../lib/plexus/types'
import type { BridgeCall, BridgeMessage } from './bridge'

// ── Channel: turns push-based bridge messages into an async generator ─────────

interface Channel<T> {
  push(item: T): void
  end(): void
  error(msg: string): void
  [Symbol.asyncIterator](): AsyncIterator<T>
}

function makeChannel<T>(): Channel<T> {
  const queue: Array<{ value: T } | { done: true } | { error: string }> = []
  let waiting: ((entry: { value: T } | { done: true } | { error: string }) => void) | null = null

  function enqueue(entry: { value: T } | { done: true } | { error: string }) {
    if (waiting) {
      const w = waiting
      waiting = null
      w(entry)
    } else {
      queue.push(entry)
    }
  }

  return {
    push(item: T) { enqueue({ value: item }) },
    end()         { enqueue({ done: true }) },
    error(msg)    { enqueue({ error: msg }) },
    [Symbol.asyncIterator](): AsyncIterator<T> {
      return {
        next(): Promise<IteratorResult<T>> {
          if (queue.length) {
            const entry = queue.shift()!
            if ('error' in entry) return Promise.reject(new Error(entry.error))
            if ('done' in entry)  return Promise.resolve({ value: undefined as T, done: true })
            return Promise.resolve({ value: entry.value, done: false })
          }
          return new Promise<IteratorResult<T>>((resolve, reject) => {
            waiting = (entry) => {
              if ('error' in entry) reject(new Error(entry.error))
              else if ('done' in entry) resolve({ value: undefined as T, done: true })
              else resolve({ value: entry.value, done: false })
            }
          })
        },
        return(_value?: unknown): Promise<IteratorResult<T>> {
          // Wake up any consumer blocked on next()
          if (waiting) {
            const w = waiting
            waiting = null
            w({ done: true })
          }
          queue.length = 0
          return Promise.resolve({ value: undefined as T, done: true })
        },
      }
    },
  }
}

// ── Bridge state ──────────────────────────────────────────────────────────────

let bridgeWs: WebSocket | null = null

// Channel yields the plain content of data items (not full PlexusStreamItem).
// done/error items from the bridge terminate the channel via end()/error().
const pendingCalls = new Map<string, Channel<unknown>>()

export function setBridgeWs(ws: WebSocket): void {
  bridgeWs = ws
  console.log('[plexus-gamma] bridge connected')
}

export function clearBridgeWs(): void {
  bridgeWs = null
  console.log('[plexus-gamma] bridge disconnected')
  for (const [callId, ch] of pendingCalls) {
    ch.error('Bridge disconnected')
    pendingCalls.delete(callId)
  }
}

export function handleBridgeMessage(msg: BridgeMessage): void {
  if (msg.type === 'ready') {
    console.log('[plexus-gamma] bridge ready')
    return
  }

  const ch = pendingCalls.get(msg.callId)
  if (!ch) return

  if (msg.type === 'item') {
    const item = msg.item
    if (item.type === 'data') {
      // Extract content — server.ts will re-wrap in a data subscription item
      ch.push(item.content)
    } else if (item.type === 'done') {
      // Explicit done item from the browser generator — end the channel
      pendingCalls.delete(msg.callId)
      ch.end()
    } else if (item.type === 'error') {
      // Error item from the browser — surface as a channel error
      pendingCalls.delete(msg.callId)
      ch.error(item.message)
    }
    // progress / request items: ignored for now
  } else if (msg.type === 'done') {
    // Redundant terminator sent by useBridge after the generator finishes;
    // only act if the channel is still open (not already ended by a done item)
    if (pendingCalls.has(msg.callId)) {
      pendingCalls.delete(msg.callId)
      ch.end()
    }
  } else if (msg.type === 'error') {
    pendingCalls.delete(msg.callId)
    ch.error(msg.message)
  }
}

// ── Forward a call to the Vue app via the bridge ──────────────────────────────

// Yields plain content values (extracted from data items).
// done/error are signalled via channel termination, not as yielded items.
export function forwardToBridge(method: string, params: unknown): AsyncIterable<unknown> {
  if (!bridgeWs) {
    return (async function*() {
      throw new Error('No UI bridge connected')
    })()
  }

  const callId = randomUUID()
  const ch = makeChannel<unknown>()
  pendingCalls.set(callId, ch)

  const msg: BridgeCall = { type: 'call', callId, method, params }
  bridgeWs.send(JSON.stringify(msg))

  return {
    [Symbol.asyncIterator]() {
      const chIter = ch[Symbol.asyncIterator]()
      return {
        next() { return chIter.next() },
        return(value?: unknown): Promise<IteratorResult<unknown>> {
          // Consumer abandoned — send cancel to bridge and wake up the channel
          if (pendingCalls.has(callId)) {
            pendingCalls.delete(callId)
            if (bridgeWs) {
              bridgeWs.send(JSON.stringify({ type: 'cancel', callId } satisfies BridgeCall))
            }
          }
          return chIter.return!(value)
        },
      }
    },
  }
}
