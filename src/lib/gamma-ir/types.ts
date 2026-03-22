/**
 * gamma-ir — Normalised IR for plexus-gamma
 *
 * All components consume this instead of interpreting raw JSON Schema directly.
 */

// ─── Type references ─────────────────────────────────────────────────────────

export type TypeRef =
  | { kind: 'named';     namespace: string; name: string }
  | { kind: 'array';     items: TypeRef }
  | { kind: 'optional';  inner: TypeRef }
  | { kind: 'primitive'; type: string; format?: string }
  | { kind: 'any' }      // unconstrained schema (serde_json::Value)
  | { kind: 'unknown' }  // missing / unresolvable schema

// ─── Type kinds ──────────────────────────────────────────────────────────────

export type TypeKind =
  | { tag: 'struct';     fields: FieldDef[] }
  | { tag: 'enum';       discriminator: string; variants: VariantDef[] }
  | { tag: 'stringEnum'; values: string[] }
  | { tag: 'alias';      target: TypeRef }
  | { tag: 'primitive';  type: string; format?: string }

// ─── Field / variant definitions ─────────────────────────────────────────────

export interface FieldDef {
  wireName:    string         // snake_case — wire format (schemars key)
  displayName: string         // camelCase  — for form labels / formValues keys
  type:        TypeRef
  description: string | null
  required:    boolean
  default:     unknown | null
}

export interface VariantDef {
  name:        string         // discriminator const value (e.g. "by_name")
  description: string | null
  fields:      FieldDef[]
}

export interface TypeDef {
  name:        string
  namespace:   string         // fully-qualified plugin path (e.g. "cone", "arbor.view")
  kind:        TypeKind
  description: string | null
}

// ─── Method IR ───────────────────────────────────────────────────────────────

export interface MethodIR {
  name:        string
  namespace:   string
  fullPath:    string         // namespace + "." + name (e.g. "cone.list")
  description: string | null
  params:      FieldDef[]
  returns:     TypeRef
  streaming:   boolean
}

// ─── Top-level IR ─────────────────────────────────────────────────────────────

export interface IR {
  namespace: string
  typeDefs:  TypeDef[]
  methods:   MethodIR[]
}
