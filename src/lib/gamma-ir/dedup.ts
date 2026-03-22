/**
 * Type deduplication.
 *
 * When multiple plugins define structurally identical types, select a canonical
 * representative and redirect all TypeRefs pointing to non-canonical defs.
 *
 * Mirrors Synapse.IR.Builder.deduplicateTypes.
 * Prefer the shorter namespace; tie-break on shorter name.
 */

import type { TypeDef, TypeRef, TypeKind, FieldDef, VariantDef } from './types'

// ─── Structural fingerprint ──────────────────────────────────────────────────

function fingerprintKind(kind: TypeKind): string {
  switch (kind.tag) {
    case 'struct':
      return 'struct:' + kind.fields.map(f => `${f.wireName}:${fingerprintRef(f.type)}`).join(',')
    case 'enum':
      return 'enum:' + kind.variants.map(v => v.name + ':' + v.fields.map(f => f.wireName).join(',')).join('|')
    case 'stringEnum':
      return 'stringEnum:' + [...kind.values].sort().join(',')
    case 'alias':
      return 'alias:' + fingerprintRef(kind.target)
    case 'primitive':
      return 'primitive:' + kind.type + (kind.format ? ':' + kind.format : '')
  }
}

function fingerprintRef(ref: TypeRef): string {
  switch (ref.kind) {
    case 'named':     return `named:${ref.namespace}.${ref.name}`
    case 'array':     return `array:${fingerprintRef(ref.items)}`
    case 'optional':  return `optional:${fingerprintRef(ref.inner)}`
    case 'primitive': return `primitive:${ref.type}${ref.format ? ':' + ref.format : ''}`
    case 'any':       return 'any'
    case 'unknown':   return 'unknown'
  }
}

// ─── Canonical selection ─────────────────────────────────────────────────────

function canonicalKey(a: TypeDef, b: TypeDef): TypeDef {
  // Prefer shorter namespace (parent/root), tie-break on shorter name
  if (a.namespace.length !== b.namespace.length) {
    return a.namespace.length < b.namespace.length ? a : b
  }
  return a.name.length <= b.name.length ? a : b
}

// ─── Ref rewriting ───────────────────────────────────────────────────────────

function rewriteRef(ref: TypeRef, remap: Map<string, TypeDef>): TypeRef {
  switch (ref.kind) {
    case 'named': {
      const key = `${ref.namespace}.${ref.name}`
      const canon = remap.get(key)
      return canon ? { kind: 'named', namespace: canon.namespace, name: canon.name } : ref
    }
    case 'array':    return { kind: 'array',    items: rewriteRef(ref.items, remap) }
    case 'optional': return { kind: 'optional', inner: rewriteRef(ref.inner, remap) }
    default:         return ref
  }
}

function rewriteField(f: FieldDef, remap: Map<string, TypeDef>): FieldDef {
  return { ...f, type: rewriteRef(f.type, remap) }
}

function rewriteVariant(v: VariantDef, remap: Map<string, TypeDef>): VariantDef {
  return { ...v, fields: v.fields.map(f => rewriteField(f, remap)) }
}

function rewriteKind(kind: TypeKind, remap: Map<string, TypeDef>): TypeKind {
  switch (kind.tag) {
    case 'struct':
      return { tag: 'struct', fields: kind.fields.map(f => rewriteField(f, remap)) }
    case 'enum':
      return { tag: 'enum', discriminator: kind.discriminator, variants: kind.variants.map(v => rewriteVariant(v, remap)) }
    case 'alias':
      return { tag: 'alias', target: rewriteRef(kind.target, remap) }
    default:
      return kind
  }
}

// ─── deduplicateTypes ────────────────────────────────────────────────────────

export function deduplicateTypes(typeDefs: TypeDef[]): TypeDef[] {
  // Group by structural fingerprint
  const groups = new Map<string, TypeDef[]>()
  for (const td of typeDefs) {
    const fp = fingerprintKind(td.kind)
    const group = groups.get(fp)
    if (group) group.push(td)
    else groups.set(fp, [td])
  }

  // Build remap: non-canonical key → canonical TypeDef
  const remap = new Map<string, TypeDef>()
  const canonicals: TypeDef[] = []

  for (const group of groups.values()) {
    if (group.length === 0) continue
    let canon = group[0]!
    for (let i = 1; i < group.length; i++) {
      canon = canonicalKey(canon, group[i]!)
    }
    canonicals.push(canon)
    for (const td of group) {
      const key = `${td.namespace}.${td.name}`
      const canonKey = `${canon.namespace}.${canon.name}`
      if (key !== canonKey) remap.set(key, canon)
    }
  }

  // Rewrite all refs in canonical set
  return canonicals.map(td => ({
    ...td,
    kind: rewriteKind(td.kind, remap),
  }))
}

/**
 * Rewrite all TypeRefs across an array of IRs after deduplication.
 * Call after merging typeDefs from multiple plugins.
 */
export function rewriteIRRefs(typeDefs: TypeDef[], remap: Map<string, TypeDef>): TypeDef[] {
  return typeDefs.map(td => ({ ...td, kind: rewriteKind(td.kind, remap) }))
}
