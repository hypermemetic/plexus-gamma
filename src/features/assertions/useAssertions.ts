import { ref, watch } from 'vue'
import type { PlexusRpcClient } from '../../lib/plexus/transport'

// ── Types ─────────────────────────────────────────────────────────────────

export type AssertionOp =
  | 'equals'
  | 'contains'
  | 'exists'
  | 'not_exists'
  | 'gt'
  | 'lt'
  | 'matches'

export interface Assertion {
  id: string
  field: string
  op: AssertionOp
  value: string
}

export interface TestCase {
  id: string
  name: string
  method: string
  params: unknown
  assertions: Assertion[]
}

export interface AssertionResult {
  assertionId: string
  passed: boolean
  actual: unknown
  message: string
}

export interface TestRun {
  testId: string
  runAt: number
  durationMs: number
  passed: boolean
  results: AssertionResult[]
}

// ── Storage key ──────────────────────────────────────────────────────────

const STORAGE_KEY = 'plexus-gamma:assertions'

// ── Dot-path resolver ────────────────────────────────────────────────────

function resolvePath(obj: unknown, path: string): unknown {
  if (path === '' || path === '.') return obj
  const parts = path.split('.')
  let current: unknown = obj
  for (const part of parts) {
    if (current === null || current === undefined) return undefined
    if (typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

// ── Single assertion evaluator ───────────────────────────────────────────

export function evaluate(
  a: Assertion,
  content: unknown,
): { passed: boolean; actual: unknown; message: string } {
  const actual = resolvePath(content, a.field)

  switch (a.op) {
    case 'exists': {
      const passed = actual !== null && actual !== undefined
      return {
        passed,
        actual,
        message: passed
          ? `field "${a.field}" exists`
          : `field "${a.field}" is absent or null`,
      }
    }

    case 'not_exists': {
      const passed = actual === null || actual === undefined
      return {
        passed,
        actual,
        message: passed
          ? `field "${a.field}" is absent or null`
          : `field "${a.field}" exists with value ${JSON.stringify(actual)}`,
      }
    }

    case 'equals': {
      const passed = JSON.stringify(actual) === JSON.stringify(parseValue(a.value))
      return {
        passed,
        actual,
        message: passed
          ? `"${a.field}" equals ${a.value}`
          : `expected ${a.value}, got ${JSON.stringify(actual)}`,
      }
    }

    case 'contains': {
      const passed = Array.isArray(actual)
        ? actual.includes(parseValue(a.value))
        : typeof actual === 'string'
          ? actual.includes(a.value)
          : String(actual).includes(a.value)
      return {
        passed,
        actual,
        message: passed
          ? `"${a.field}" contains ${a.value}`
          : `"${a.field}" (${JSON.stringify(actual)}) does not contain ${a.value}`,
      }
    }

    case 'gt': {
      const num = Number(actual)
      const threshold = Number(a.value)
      const passed = !isNaN(num) && !isNaN(threshold) && num > threshold
      return {
        passed,
        actual,
        message: passed
          ? `${JSON.stringify(actual)} > ${a.value}`
          : `expected ${JSON.stringify(actual)} to be > ${a.value}`,
      }
    }

    case 'lt': {
      const num = Number(actual)
      const threshold = Number(a.value)
      const passed = !isNaN(num) && !isNaN(threshold) && num < threshold
      return {
        passed,
        actual,
        message: passed
          ? `${JSON.stringify(actual)} < ${a.value}`
          : `expected ${JSON.stringify(actual)} to be < ${a.value}`,
      }
    }

    case 'matches': {
      let passed = false
      let message = ''
      try {
        const re = new RegExp(a.value)
        passed = re.test(String(actual))
        message = passed
          ? `"${a.field}" matches /${a.value}/`
          : `"${a.field}" (${JSON.stringify(actual)}) does not match /${a.value}/`
      } catch {
        message = `Invalid regex: ${a.value}`
      }
      return { passed, actual, message }
    }
  }
}

function parseValue(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

// ── ID generator ─────────────────────────────────────────────────────────

function newId(): string {
  return Math.random().toString(36).slice(2, 10)
}

// ── Composable ───────────────────────────────────────────────────────────

export function useAssertionSuite() {
  // Load persisted tests
  const stored = (() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? (parsed as TestCase[]) : []
    } catch {
      return []
    }
  })()

  const tests = ref<TestCase[]>(stored)
  const runs  = ref<Map<string, TestRun>>(new Map())

  // Persist to localStorage on every change
  watch(
    tests,
    (value) => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
      } catch {
        // quota exceeded or private browsing — ignore
      }
    },
    { deep: true },
  )

  // ── Mutations ───────────────────────────────────────────────────────────

  function addTest(t: Omit<TestCase, 'id'>): string {
    const id = newId()
    tests.value.push({ ...t, id })
    return id
  }

  function removeTest(id: string): void {
    const idx = tests.value.findIndex(t => t.id === id)
    if (idx !== -1) tests.value.splice(idx, 1)
    const next = new Map(runs.value)
    next.delete(id)
    runs.value = next
  }

  function addAssertion(testId: string, a: Omit<Assertion, 'id'>): void {
    const test = tests.value.find(t => t.id === testId)
    if (!test) return
    test.assertions.push({ ...a, id: newId() })
  }

  function removeAssertion(testId: string, assertionId: string): void {
    const test = tests.value.find(t => t.id === testId)
    if (!test) return
    const idx = test.assertions.findIndex(a => a.id === assertionId)
    if (idx !== -1) test.assertions.splice(idx, 1)
  }

  // ── Runner ──────────────────────────────────────────────────────────────

  async function runTest(testId: string, rpc: PlexusRpcClient): Promise<TestRun> {
    const test = tests.value.find(t => t.id === testId)
    if (!test) throw new Error(`Test ${testId} not found`)

    const startMs = Date.now()
    let content: unknown = undefined
    let rpcError: string | null = null

    try {
      for await (const item of rpc.call(test.method, test.params)) {
        if (item.type === 'data') {
          content = item.content
          break
        } else if (item.type === 'error') {
          rpcError = item.message + (item.code ? ` [${item.code}]` : '')
          break
        } else if (item.type === 'done') {
          break
        }
        // 'progress' — continue
      }
    } catch (e) {
      rpcError = e instanceof Error ? e.message : String(e)
    }

    const durationMs = Date.now() - startMs

    const results: AssertionResult[] = rpcError !== null
      ? test.assertions.map(a => ({
          assertionId: a.id,
          passed: false,
          actual: undefined,
          message: `RPC error: ${rpcError}`,
        }))
      : test.assertions.map(a => {
          const ev = evaluate(a, content)
          return { assertionId: a.id, ...ev }
        })

    const passed = results.length > 0 && results.every(r => r.passed)

    const run: TestRun = {
      testId,
      runAt: Date.now(),
      durationMs,
      passed,
      results,
    }

    const next = new Map(runs.value)
    next.set(testId, run)
    runs.value = next

    return run
  }

  async function runAll(rpc: PlexusRpcClient): Promise<void> {
    for (const test of tests.value) {
      await runTest(test.id, rpc)
    }
  }

  return {
    tests,
    runs,
    addTest,
    removeTest,
    addAssertion,
    removeAssertion,
    runTest,
    runAll,
    evaluate,
  }
}
