/**
 * buildIR — main entry point.
 *
 * Takes a PluginSchema (as returned by the backend's .schema RPC method)
 * and returns a normalised IR.
 */

import type { IR, TypeDef, MethodIR } from './types'
import type { PluginSchema } from '../../plexus-schema'
import { extractDefs, inlineRefs } from './refs'
import { inferTypeKind, extractParamFields, schemaToTypeRef } from './extract'
import { inferTypeName } from './names'
import { deduplicateTypes } from './dedup'

export function buildIR(schema: PluginSchema): IR {
  const namespace = schema.namespace
  const typeDefs: TypeDef[] = []

  for (const method of schema.methods) {
    const paramsSchema = method.params
    const returnsSchema = method.returns
    const methodDefs = buildMethodTypeDefs(paramsSchema, returnsSchema, namespace)
    typeDefs.push(...methodDefs)
  }

  const deduped = deduplicateTypes(typeDefs)

  const methods: MethodIR[] = schema.methods.map(method => {
    const paramsSchema = method.params
    const returnsSchema = method.returns
    const defs = extractDefs(paramsSchema)

    const params = extractParamFields(paramsSchema, defs, namespace)
    const returns = returnsSchema
      ? schemaToTypeRef(inlineRefs(returnsSchema, extractDefs(returnsSchema)), extractDefs(returnsSchema), namespace)
      : { kind: 'unknown' as const }

    return {
      name:        method.name,
      namespace,
      fullPath:    `${namespace}.${method.name}`,
      description: method.description ?? null,
      params,
      returns,
      streaming:   method.streaming,
    }
  })

  return { namespace, typeDefs: deduped, methods }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function buildMethodTypeDefs(
  paramsSchema: unknown,
  returnsSchema: unknown,
  namespace: string,
): TypeDef[] {
  const defs: TypeDef[] = []

  // Extract TypeDefs from $defs sections
  if (paramsSchema && typeof paramsSchema === 'object') {
    const paramDefs = extractDefs(paramsSchema)
    for (const [name, defSchema] of Object.entries(paramDefs)) {
      defs.push(schemaToTypeDef(defSchema, name, namespace, paramDefs))
    }
  }
  if (returnsSchema && typeof returnsSchema === 'object') {
    const returnDefs = extractDefs(returnsSchema)
    for (const [defName, defSchema] of Object.entries(returnDefs)) {
      defs.push(schemaToTypeDef(defSchema, defName, namespace, returnDefs))
    }
    // Also add the return type itself if it has a title
    const rs = returnsSchema as Record<string, unknown>
    if (rs.title && typeof rs.title === 'string') {
      defs.push(schemaToTypeDef(returnsSchema, rs.title, namespace, returnDefs))
    }
  }

  return defs
}

function schemaToTypeDef(
  schema: unknown,
  name: string,
  namespace: string,
  defs: Record<string, unknown>,
): TypeDef {
  try {
    const kind = inferTypeKind(schema, defs, namespace)
    const s = schema as Record<string, unknown>
    const description = (s && typeof s.description === 'string') ? s.description : null
    const resolvedName = inferTypeName(s ?? {}, name)
    return { name: resolvedName, namespace, kind, description }
  } catch {
    return {
      name,
      namespace,
      kind: { tag: 'alias', target: { kind: 'unknown' } },
      description: null,
    }
  }
}
