# GAMMA-IR-1: Build `gamma-ir` — Normalised IR for plexus-gamma

**Status:** Planning
**Date:** 2026-03-20

---

## Problem

plexus-gamma interprets raw JSON Schema ad-hoc at the point of use. Every component that touches a schema does its own partial interpretation, leading to:

1. **Incorrect union variant labels** — `SchemaField.vue`'s `branchLabel()` checks `s.type` and `s.enum` but misses `properties.*.const` (the discriminator pattern used by schemars 1.x / JSON Schema Draft 2020-12 for `#[serde(tag)]` enums). Result: `cone.get`'s `identifier` renders as "Option 1 (Object) / Option 2 (Object)" instead of "by_name / by_id".

2. **Duplicated key-transformation logic** — `MethodInvoker.vue` carries its own `toCamelCase`/`toSnakeCase`/`keysToSnake` and a `resolveRefs` pass that re-derives camelCase keys from the snake_case schema. The same problem is latent in every other component that reads or writes params.

3. **No `$ref`/`$defs` resolution** — references are resolved only partially, only inside `MethodInvoker`. Components that render type information outside the invoker (TreeSheetView, wiring sidebar) see unresolved `$ref` strings.

4. **No streaming detection** — `MethodSchema.streaming` comes from the backend, but the IR doesn't know *why* a method is streaming or how many variants the result union has.

5. **No nullable normalisation** — `anyOf: [T, { type: "null" }]` is not unwrapped into an optional type.

6. **No type deduplication** — identical types defined across plugins are treated as separate entities.

7. **Resilience gaps** — a malformed plugin schema causes rendering failures rather than being skipped gracefully.

Synapse's Haskell IR builder (`Synapse/IR/Builder.hs`) solves all of these. gamma needs an equivalent in TypeScript that every component consumes instead of each re-interpreting raw JSON Schema.

---

## Proposed Solution

A new package: **`gamma-ir`**

- Standalone TypeScript library (no Vue, no DOM)
- Input: raw JSON Schema as received from any plexus-rpc backend
- Output: a normalised, typed IR that components consume directly
- Replaces all ad-hoc schema interpretation scattered across gamma

---

## Features to Migrate from Synapse IR Builder

### 1. IR Type System (`Synapse/IR/Types.hs`)

Port the core types to TypeScript:

```ts
// Mirrors Haskell TypeDef / TypeKind / TypeRef
type TypeRef =
  | { kind: 'named';    namespace: string; name: string }
  | { kind: 'array';    items: TypeRef }
  | { kind: 'optional'; inner: TypeRef }
  | { kind: 'primitive'; type: string; format?: string }
  | { kind: 'any' }      // serde_json::Value — no schema constraints
  | { kind: 'unknown' }  // missing schema — should warn

type TypeKind =
  | { tag: 'struct';      fields: FieldDef[] }
  | { tag: 'enum';        discriminator: string; variants: VariantDef[] }
  | { tag: 'stringEnum';  values: string[] }
  | { tag: 'alias';       target: TypeRef }
  | { tag: 'primitive';   type: string; format?: string }

interface FieldDef {
  wireName:    string          // snake_case — as emitted by schemars (wire format)
  displayName: string          // camelCase — for UI rendering
  type:        TypeRef
  description: string | null
  required:    boolean
  default:     unknown | null
}

interface VariantDef {
  name:        string          // discriminator const value (e.g. "by_name", "by_id")
  description: string | null
  fields:      FieldDef[]
}

interface TypeDef {
  name:        string
  namespace:   string          // fully qualified plugin path (e.g. "cone", "arbor.view")
  kind:        TypeKind
  description: string | null
}
```

**Haskell source:** `Synapse/IR/Types.hs`

---

### 2. Discriminator Detection (`extractVariant`)

For `oneOf`/`anyOf` variants that are objects with an internally-tagged discriminator:

```json
{ "type": "object", "properties": { "type": { "const": "by_name" }, "name": { ... } } }
```

Extract `properties.*.const` as the variant name. Exclude the discriminator field from `FieldDef` list. Use the `const` value (e.g. `"by_name"`) as `VariantDef.name`.

**Replaces in gamma:** `branchLabel()` in `SchemaField.vue`
**Haskell source:** `Builder.hs:extractVariant` (line ~498)

---

### 3. Title / Name Inference

- If a schema has a `"title"` field → use it as the type name
- For method return types with no title → `methodName + "Result"` (e.g. `chatResult`)
- Variant labels → discriminator const value, falling back to index only as last resort

**Haskell source:** `Builder.hs` lines ~460–462

---

### 4. `$ref` / `$defs` Resolution

- Collect all entries from `"$defs"` (draft-2020) and `"definitions"` (draft-07)
- Replace `{ "$ref": "#/$defs/Foo" }` with `TypeRef { kind: 'named', name: 'Foo', namespace }`
- Definitions that are themselves `oneOf`/struct/etc. become `TypeDef` entries in the IR

**Replaces in gamma:** `resolveRefs()` in `MethodInvoker.vue` (partial, invoker-only)
**Haskell source:** `Builder.hs:extractTypeDef`, `schemaToTypeRef` lines ~549–687

---

### 5. Nullable Normalisation

`anyOf: [T, { type: "null" }]` or `anyOf: [{ "$ref": "#/$defs/Foo" }, { type: "null" }]`
→ `TypeRef { kind: 'optional', inner: T }`

Also handle the schemars pattern: `anyOf` with a single non-null ref → `optional`.

**Haskell source:** `Builder.hs:schemaToTypeRef` lines ~670–680

---

### 6. Wire Name ↔ Display Name (NEW — beyond Synapse)

This is the key addition over what Synapse does. Synapse normalises for code generation; gamma-ir normalises for UI rendering.

Every `FieldDef` carries two names:
- `wireName` — the raw property key from the JSON Schema (always snake_case, as schemars emits it). This is what goes over the WebSocket.
- `displayName` — the camelCase form for form labels, input names, and `formValues` keys.

The transformation is done **once** in `gamma-ir` using the same rules currently duplicated across components:
```ts
wireName → displayName:  snake_case → camelCase  (e.g. "cone_id" → "coneId")
displayName → wireName:  camelCase → snake_case  (reverse, for sending params)
```

**Replaces in gamma:**
- `toCamelCase` / `toSnakeCase` / `keysToSnake` in `MethodInvoker.vue`
- `toSnakeCase` in `SchemaField.vue`'s `inspectValidation`
- Any future component that sends or renders params

---

### 7. Streaming Detection

A method's return type is streaming if its `oneOf` union has more than one non-error variant. This is a structural property derivable from the IR — components should not have to detect it themselves.

**Haskell source:** `Builder.hs:extractReturns` lines ~465–477

---

### 8. Namespace Qualification

All extracted types are prefixed with the plugin's full path:
- `cone` + `ListResult` → `cone.ListResult`
- `arbor.view` + `Range` → `arbor.view.Range`

Prevents collisions when multiple plugins define types with the same local name.

**Haskell source:** `Builder.hs:extractFromPlugin` line ~322

---

### 9. Type Deduplication

When multiple plugins define structurally identical types (same fields, same kinds, different namespaces), select a canonical representative and redirect all refs to it. Prefer the parent namespace; tie-break on shortest name.

**Haskell source:** `Builder.hs:deduplicateTypes` lines ~155–315

---

### 10. `RefAny` and `RefUnknown`

- Schema object with no type constraints → `TypeRef { kind: 'any' }` (deliberate serde_json::Value)
- Missing / null / false schema → `TypeRef { kind: 'unknown' }` (should produce a console warning)

**Haskell source:** `Builder.hs:schemaToTypeRef` lines ~680–687

---

### 11. Format Hints

Preserve the `"format"` field from primitive schemas (e.g. `"uuid"`, `"int64"`, `"date-time"`). Components can use this to render appropriate input types or validation.

---

### 12. Resilience

A malformed plugin schema (bad `$ref`, missing `properties`, etc.) must not crash the whole build. Log a warning and emit `TypeRef { kind: 'unknown' }` rather than throwing.

**Haskell source:** `Recursion.hs:hyloMPar` — `catMaybes` over failed children

---

## What gamma-ir Replaces in plexus-gamma

| Current location | Current behaviour | Replaced by |
|---|---|---|
| `SchemaField.vue:branchLabel()` | ad-hoc `s.type`/`s.enum` check, misses `const` | `VariantDef.name` from IR |
| `MethodInvoker.vue:resolveRefs()` | partial `$ref` resolution, camelCase keys, invoker-only | `FieldDef.displayName` / `FieldDef.wireName` from IR |
| `MethodInvoker.vue:keysToSnake()` | runtime snake_case conversion on every invoke | `FieldDef.wireName` used directly when building params |
| `MethodInvoker.vue:toCamelCase/toSnakeCase` | duplicated in every component that needs them | eliminated; done once in `gamma-ir` during normalisation |
| `schemaCache.ts` | caches raw tree from backend | extended to also cache normalised IR per plugin |
| TreeSheetView, wiring sidebar | render raw type strings | render from typed `TypeDef`/`TypeRef` |

---

## Package Structure

```
gamma-ir/
├── src/
│   ├── types.ts          — TypeDef, TypeRef, FieldDef, VariantDef, MethodIR
│   ├── walk.ts           — schema tree traversal (mirrors Walk.hs)
│   ├── extract.ts        — extractVariant, inferTypeKind, extractTypeDef (mirrors Builder.hs)
│   ├── refs.ts           — $ref/$defs resolution, schemaToTypeRef
│   ├── names.ts          — wireName↔displayName transforms, title inference
│   ├── dedup.ts          — type deduplication (mirrors deduplicateTypes)
│   ├── build.ts          — main entry: buildIR(pluginSchema) → IR
│   └── index.ts          — public exports
├── tests/
│   └── build.test.ts     — unit tests for each transform
├── package.json
└── tsconfig.json
```

The library has no runtime dependencies beyond what the workspace already provides. It is synchronous (schema is already fetched by the time it runs).

---

## Integration Points in plexus-gamma

1. `schemaCache.ts` → after fetching a plugin tree, run `buildIR(tree)` and cache the result
2. `SchemaField.vue` → receive `FieldDef[]` instead of raw JSON Schema where possible; use `VariantDef.name` in the union selector
3. `MethodInvoker.vue` → use `FieldDef.displayName` for form keys, `FieldDef.wireName` when building the outbound params object; remove `keysToSnake`, `toCamelCase`, `resolveRefs`
4. `TreeSheetView`, wiring sidebar → render from `TypeDef`/`TypeRef` instead of raw schema strings

---

## Migration Order

1. **Build `gamma-ir` as a package** — types, extract, refs, names, dedup, build; full test coverage
2. **Fix `branchLabel`** — immediate fix while the library is built (look for `properties.*.const`)
3. **Wire into `schemaCache`** — run `buildIR` after fetch, cache IR alongside raw tree
4. **Migrate `SchemaField`** — replace `resolveRefs` + `branchLabel` with IR-derived data
5. **Migrate `MethodInvoker`** — replace `keysToSnake`/`toCamelCase`/`resolveRefs` with `FieldDef` names
6. **Migrate read-only views** — TreeSheetView, wiring sidebar, type browser

Steps 1–3 can land without breaking anything. Steps 4–6 are incremental regressions-checked against the existing Playwright suite.
