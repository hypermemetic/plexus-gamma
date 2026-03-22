/**
 * $ref / $defs resolution.
 *
 * Collects all definitions from `$defs` (draft-2020) and `definitions` (draft-07),
 * and resolves `{ "$ref": "#/$defs/Foo" }` into the raw schema object.
 */

export type Defs = Record<string, unknown>

/**
 * Extract the definitions map from a top-level schema.
 * Merges both `$defs` (draft-2020) and `definitions` (draft-07).
 */
export function extractDefs(schema: unknown): Defs {
  if (!schema || typeof schema !== 'object') return {}
  const s = schema as Record<string, unknown>
  const defs: Defs = {}
  for (const key of ['$defs', 'definitions']) {
    if (s[key] && typeof s[key] === 'object') {
      Object.assign(defs, s[key] as Record<string, unknown>)
    }
  }
  return defs
}

/**
 * Resolve a `$ref` string to the raw schema it points to.
 * Handles `#/$defs/Foo` and `#/definitions/Foo`.
 * Returns null if the ref cannot be resolved.
 */
export function resolveRef(ref: string, defs: Defs): unknown | null {
  const match = ref.match(/^#\/(?:\$defs|definitions)\/(.+)$/)
  if (!match) return null
  const name = match[1]!
  return Object.prototype.hasOwnProperty.call(defs, name) ? defs[name] ?? null : null
}

/**
 * Extract the local name from a `$ref` string.
 * `#/$defs/FooBar` → `"FooBar"`
 */
export function refName(ref: string): string | null {
  const match = ref.match(/^#\/(?:\$defs|definitions)\/(.+)$/)
  return match ? (match[1] ?? null) : null
}

/**
 * Inline-resolve all `$ref` occurrences in a schema (shallow, single pass).
 * Used for param schemas that need full resolution before field extraction.
 */
export function inlineRefs(schema: unknown, defs: Defs): unknown {
  if (!schema || typeof schema !== 'object') return schema
  const s = schema as Record<string, unknown>
  if (typeof s['$ref'] === 'string') {
    const resolved = resolveRef(s['$ref'], defs)
    return resolved !== null ? inlineRefs(resolved, defs) : schema
  }
  // Recurse into properties, items, oneOf, anyOf
  const result: Record<string, unknown> = { ...s }
  if (s.properties && typeof s.properties === 'object') {
    const props: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(s.properties as Record<string, unknown>)) {
      props[k] = inlineRefs(v, defs)
    }
    result.properties = props
  }
  if (Array.isArray(s.oneOf)) result.oneOf = s.oneOf.map(v => inlineRefs(v, defs))
  if (Array.isArray(s.anyOf)) result.anyOf = s.anyOf.map(v => inlineRefs(v, defs))
  if (s.items) result.items = inlineRefs(s.items, defs)
  return result
}
