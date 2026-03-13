import { ref } from 'vue'

const STORAGE_KEY = 'plexus-gamma:history'
const MAX_RECORDS = 200

export interface InvocationRecord {
  id: string
  timestamp: number
  backend: string
  method: string
  params: unknown
  results: unknown[]
  durationMs: number
}

function loadFromStorage(): InvocationRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed as InvocationRecord[]
  } catch {
    return []
  }
}

function saveToStorage(records: InvocationRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
  } catch {
    // localStorage quota exceeded or unavailable — silently ignore
  }
}

// Module-level singleton so any file can import and call record()
// without going through Vue provide/inject.
const _history = ref<InvocationRecord[]>(loadFromStorage())

export function useInvocationHistory() {
  function record(r: Omit<InvocationRecord, 'id'>): string {
    const id = crypto.randomUUID()
    const next = [{ ...r, id }, ..._history.value]
    _history.value = next.length > MAX_RECORDS ? next.slice(0, MAX_RECORDS) : next
    saveToStorage(_history.value)
    return id
  }

  function clear(): void {
    _history.value = []
    saveToStorage([])
  }

  function remove(id: string): void {
    _history.value = _history.value.filter(r => r.id !== id)
    saveToStorage(_history.value)
  }

  return {
    history: _history,
    record,
    clear,
    remove,
  }
}
