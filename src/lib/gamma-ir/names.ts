/**
 * Wire name ↔ display name transforms.
 *
 * Done once here; never duplicated in components.
 *   wireName    — snake_case, as emitted by schemars (wire format)
 *   displayName — camelCase, for form labels / formValues keys
 */

export function snakeToCamel(s: string): string {
  return s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())
}

export function camelToSnake(s: string): string {
  return s.replace(/[A-Z]/g, c => '_' + c.toLowerCase())
}

/** Build camelCase display name from a snake_case wire key. */
export function wireToDisplay(wireName: string): string {
  return snakeToCamel(wireName)
}

/** Reconstruct snake_case wire key from a camelCase display name. */
export function displayToWire(displayName: string): string {
  return camelToSnake(displayName)
}

/**
 * Infer a human-readable type name from a JSON Schema.
 * Priority: explicit title → method-result convention → fallback.
 */
export function inferTypeName(schema: Record<string, unknown>, fallback: string): string {
  if (schema.title && typeof schema.title === 'string') return schema.title
  return fallback
}
