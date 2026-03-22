/**
 * Schema extraction — VariantDef, FieldDef, TypeKind, TypeRef.
 *
 * Mirrors Synapse.IR.Builder: extractVariant, inferTypeKind, schemaToTypeRef.
 */

import type { TypeRef, TypeKind, FieldDef, VariantDef } from './types'
import { wireToDisplay } from './names'
import type { Defs } from './refs'
import { resolveRef, refName } from './refs'

// ─── schemaToTypeRef ──────────────────────────────────────────────────────────

/**
 * Convert a raw JSON Schema to a TypeRef.
 * Never throws — returns TypeRef { kind: 'unknown' } on anything unresolvable.
 */
export function schemaToTypeRef(
  schema: unknown,
  defs: Defs,
  namespace: string,
): TypeRef {
  try {
    return _schemaToTypeRef(schema, defs, namespace)
  } catch {
    return { kind: 'unknown' }
  }
}

function _schemaToTypeRef(schema: unknown, defs: Defs, namespace: string): TypeRef {
  if (schema === null || schema === undefined || schema === false) {
    return { kind: 'unknown' }
  }

  if (typeof schema !== 'object') return { kind: 'unknown' }

  const s = schema as Record<string, unknown>

  // $ref → named TypeRef
  if (typeof s['$ref'] === 'string') {
    const name = refName(s['$ref'])
    if (name) return { kind: 'named', namespace, name }
    return { kind: 'unknown' }
  }

  // anyOf nullable pattern: [T, { type: "null" }] → optional<T>
  if (Array.isArray(s.anyOf)) {
    const nonNull = s.anyOf.filter((v: unknown) => {
      if (!v || typeof v !== 'object') return true
      const x = v as Record<string, unknown>
      return x.type !== 'null' && !(Array.isArray(x.type) && x.type.includes('null'))
    })
    const hasNull = s.anyOf.some((v: unknown) => {
      if (!v || typeof v !== 'object') return false
      const x = v as Record<string, unknown>
      return x.type === 'null' || (Array.isArray(x.type) && x.type.includes('null'))
    })
    if (hasNull && nonNull.length === 1) {
      const inner = _schemaToTypeRef(nonNull[0], defs, namespace)
      return { kind: 'optional', inner }
    }
    // Non-nullable anyOf → treat as named type (will be a TypeDef)
    if (s.title && typeof s.title === 'string') {
      return { kind: 'named', namespace, name: s.title }
    }
    return { kind: 'unknown' }
  }

  // array
  if (s.type === 'array' || Array.isArray(s.items)) {
    const items = s.items
      ? _schemaToTypeRef(s.items, defs, namespace)
      : { kind: 'any' as const }
    return { kind: 'array', items }
  }

  // object with no constraints → any (serde_json::Value)
  if (s.type === 'object' && !s.properties && !s.additionalProperties) {
    return { kind: 'any' }
  }
  if (!s.type && !s.properties && !s.oneOf && !s.anyOf && !s['$ref']) {
    return { kind: 'any' }
  }

  // primitive
  if (typeof s.type === 'string' && ['string','number','integer','boolean','null'].includes(s.type)) {
    return {
      kind: 'primitive',
      type: s.type,
      ...(typeof s.format === 'string' ? { format: s.format } : {}),
    }
  }

  // object with properties → named struct
  if (s.properties || s.type === 'object') {
    if (s.title && typeof s.title === 'string') {
      return { kind: 'named', namespace, name: s.title }
    }
    return { kind: 'any' }
  }

  // oneOf → named enum (if it has a title or discriminable variants)
  if (Array.isArray(s.oneOf)) {
    if (s.title && typeof s.title === 'string') {
      return { kind: 'named', namespace, name: s.title }
    }
    return { kind: 'unknown' }
  }

  return { kind: 'unknown' }
}

// ─── extractVariant ───────────────────────────────────────────────────────────

/**
 * Given one member of a oneOf/anyOf array, extract a VariantDef.
 *
 * For internally-tagged enums (schemars 1.x / Draft 2020-12):
 *   { properties: { type: { const: "by_name" }, name: { ... } } }
 * → VariantDef { name: "by_name", fields: [{ wireName: "name", ... }] }
 *
 * The discriminator field itself is excluded from FieldDef list.
 */
export function extractVariant(
  schema: unknown,
  defs: Defs,
  namespace: string,
  index: number,
): VariantDef {
  try {
    return _extractVariant(schema, defs, namespace, index)
  } catch {
    return { name: `variant_${index}`, description: null, fields: [] }
  }
}

function _extractVariant(
  schema: unknown,
  defs: Defs,
  namespace: string,
  index: number,
): VariantDef {
  // Resolve $ref
  if (schema && typeof schema === 'object') {
    const s = schema as Record<string, unknown>
    if (typeof s['$ref'] === 'string') {
      const resolved = resolveRef(s['$ref'], defs)
      if (resolved) return _extractVariant(resolved, defs, namespace, index)
    }
  }

  if (!schema || typeof schema !== 'object') {
    return { name: `variant_${index}`, description: null, fields: [] }
  }

  const s = schema as Record<string, unknown>
  const props = s.properties as Record<string, unknown> | undefined
  let discriminatorKey: string | null = null
  let variantName: string | null = null

  // Find the discriminator field (a property with a `const` value)
  if (props) {
    for (const [key, val] of Object.entries(props)) {
      if (val && typeof val === 'object') {
        const p = val as Record<string, unknown>
        if (p.const !== undefined) {
          discriminatorKey = key
          variantName = String(p.const)
          break
        }
      }
    }
  }

  // Fall back to title or enum
  if (!variantName) {
    if (s.title && typeof s.title === 'string') variantName = s.title
    else if (s.enum && Array.isArray(s.enum) && s.enum.length > 0) variantName = String(s.enum[0])
    else variantName = `variant_${index}`
  }

  const description = typeof s.description === 'string' ? s.description : null
  const required = Array.isArray(s.required) ? (s.required as string[]) : []

  const fields: FieldDef[] = []
  if (props) {
    for (const [key, propSchema] of Object.entries(props)) {
      if (key === discriminatorKey) continue   // skip the tag field
      const ps = propSchema as Record<string, unknown> | null
      fields.push({
        wireName:    key,
        displayName: wireToDisplay(key),
        type:        schemaToTypeRef(propSchema, defs, namespace),
        description: ps && typeof ps.description === 'string' ? ps.description : null,
        required:    required.includes(key),
        default:     ps && 'default' in ps ? ps.default : null,
      })
    }
  }

  return { name: variantName, description, fields }
}

// ─── inferTypeKind ────────────────────────────────────────────────────────────

/**
 * Given a top-level schema (a $defs entry or inline object), determine its TypeKind.
 */
export function inferTypeKind(
  schema: unknown,
  defs: Defs,
  namespace: string,
): TypeKind {
  try {
    return _inferTypeKind(schema, defs, namespace)
  } catch {
    return { tag: 'alias', target: { kind: 'unknown' } }
  }
}

function _inferTypeKind(schema: unknown, defs: Defs, namespace: string): TypeKind {
  if (!schema || typeof schema !== 'object') {
    return { tag: 'alias', target: { kind: 'unknown' } }
  }

  const s = schema as Record<string, unknown>

  // String enum: { type: "string", enum: [...] }
  if (s.type === 'string' && Array.isArray(s.enum)) {
    return { tag: 'stringEnum', values: s.enum.map(String) }
  }

  // oneOf / anyOf with object variants → tagged enum
  const variants = (Array.isArray(s.oneOf) ? s.oneOf : null) ??
                   (Array.isArray(s.anyOf) ? s.anyOf : null)
  if (variants) {
    // Filter null
    const nonNull = variants.filter((v: unknown) => {
      if (!v || typeof v !== 'object') return true
      const x = v as Record<string, unknown>
      return x.type !== 'null'
    })
    if (nonNull.length > 0) {
      const variantDefs = nonNull.map((v, i) => extractVariant(v, defs, namespace, i))
      // Detect discriminator key: the property that always has a const
      let discriminator = 'type'
      for (const v of nonNull) {
        if (v && typeof v === 'object') {
          const sv = v as Record<string, unknown>
          if (sv.properties && typeof sv.properties === 'object') {
            const props = sv.properties as Record<string, unknown>
            for (const [key, val] of Object.entries(props)) {
              if (val && typeof val === 'object' && 'const' in (val as object)) {
                discriminator = key
                break
              }
            }
          }
        }
      }
      return { tag: 'enum', discriminator, variants: variantDefs }
    }
  }

  // Object with properties → struct
  if (s.properties && typeof s.properties === 'object') {
    const props = s.properties as Record<string, unknown>
    const required = Array.isArray(s.required) ? (s.required as string[]) : []
    const fields: FieldDef[] = Object.entries(props).map(([key, propSchema]) => {
      const ps = propSchema as Record<string, unknown> | null
      return {
        wireName:    key,
        displayName: wireToDisplay(key),
        type:        schemaToTypeRef(propSchema, defs, namespace),
        description: ps && typeof ps.description === 'string' ? ps.description : null,
        required:    required.includes(key),
        default:     ps && 'default' in ps ? ps.default : null,
      }
    })
    return { tag: 'struct', fields }
  }

  // Primitive alias
  if (typeof s.type === 'string') {
    return {
      tag: 'primitive',
      type: s.type,
      ...(typeof s.format === 'string' ? { format: s.format } : {}),
    }
  }

  return { tag: 'alias', target: schemaToTypeRef(schema, defs, namespace) }
}

// ─── extractParamFields ───────────────────────────────────────────────────────

/**
 * Extract the top-level FieldDef list from a method's params schema.
 * Handles the common schemars pattern: { type: "object", properties: { ... } }
 */
export function extractParamFields(
  paramsSchema: unknown,
  defs: Defs,
  namespace: string,
): FieldDef[] {
  if (!paramsSchema || typeof paramsSchema !== 'object') return []
  const s = paramsSchema as Record<string, unknown>

  // Resolve $ref
  if (typeof s['$ref'] === 'string') {
    const resolved = resolveRef(s['$ref'], defs)
    if (resolved) return extractParamFields(resolved, defs, namespace)
    return []
  }

  const kind = _inferTypeKind(paramsSchema, defs, namespace)
  if (kind.tag === 'struct') return kind.fields

  return []
}
