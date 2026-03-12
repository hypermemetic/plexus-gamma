/**
 * Wire-format types for the plexus schema protocol.
 *
 * These match Plexus.Schema.Recursive exactly — the JSON field names
 * are snake_case as serialized by the Haskell backend.
 */

export interface ChildSummary {
  namespace: string
  description: string
  hash: string
}

export interface MethodSchema {
  name: string
  description: string
  hash: string
  params?: unknown
  returns?: unknown
  streaming: boolean
  bidirectional: boolean
  request_type?: unknown
  response_type?: unknown
}

export interface PluginSchema {
  namespace: string
  version: string
  description: string
  long_description?: string
  hash: string
  methods: MethodSchema[]
  children?: ChildSummary[]  // undefined = leaf plugin, array (possibly empty) = hub
}

/** A node in the fully-resolved activation tree */
export interface PluginNode {
  schema: PluginSchema
  path: string[]        // dot-joined path from root, e.g. ["solar", "earth"]
  children: PluginNode[]
}

/** Whether this plugin is a hub (has children) or a leaf */
export function isHub(schema: PluginSchema): boolean {
  return schema.children !== undefined
}
