# camelCase ingress / snake_case egress mismatch

## What happened

When invoking a method via the form, gamma was sending camelCase parameter
keys (`workingDir`, `systemPrompt`) to the backend. The backend expected
snake_case (`working_dir`, `system_prompt`) and rejected the call.

## Root cause

The RPC transport layer (`src/lib/plexus/rpc.ts`) applies `transformKeys`
to every **response** it receives from the backend. `transformKeys` converts
all object keys from snake_case → camelCase so that TypeScript code can use
idiomatic field names:

```
server response: { "working_dir": "/path", "system_prompt": null }
      after transformKeys: { workingDir: "/path", systemPrompt: null }
```

This is correct for response data. The problem is that the same schema
object — also fetched via an RPC call — goes through the same pipeline:

```
server schema: { "properties": { "working_dir": {...}, "system_prompt": {...} },
                 "required": ["working_dir", "name", "model"] }
after transformKeys: { properties: { workingDir: {...}, systemPrompt: {...} },
                       required: ["working_dir", "name", "model"] }   ← note: array
                                                                         values are
                                                                         NOT converted
```

`transformKeys` converts **object keys** recursively. Array string values are
plain `typeof === 'string'` scalars, so they pass through unchanged (line 39
of rpc.ts: `if (typeof obj !== 'object') return obj`). This produced a subtle
split state in the resolved schema:

| field | after transformKeys |
|---|---|
| `properties` keys | camelCase (`workingDir`) |
| `required` entries | snake_case (`working_dir`) |

The form rendered field labels from `properties` keys (camelCase) and checked
`required.includes(propName)` — which silently failed for any multi-word field
because the two sides used different conventions. `name` and `model` showed `*`
(single words, no transformation); `workingDir` did not.

When the form was submitted, `formValues` contained camelCase keys (because
that is what the form fields were keyed on), and those camelCase keys were
passed directly to `rpc.call` — which forwarded them verbatim to the backend.

## Why it wasn't caught earlier

- Single-word fields (`name`, `model`) are identical in both conventions, so
  they worked correctly and didn't signal any problem.
- The `required` indicator bug (missing `*` for `workingDir`) was a visible
  symptom but was attributed to a schema issue rather than a transformation
  asymmetry.
- The actual call failure only surfaced once `claudecode.create` was invoked
  end-to-end; simpler methods (e.g. `echo.echo`) have single-word params and
  were unaffected.

## The fix

Three coordinated changes:

**1. `resolveRefs` in MethodInvoker — align `required` to camelCase**

After the schema is fetched (and `transformKeys` has run), `required` entries
are still snake_case while `properties` keys are camelCase. `resolveRefs` now
applies `toCamelCase` to every entry in `required` so both sides agree:

```typescript
if (s.required) s.required = s.required.map(toCamelCase)
```

**2. `keysToSnake` on egress — convert back before sending**

`formValues` (keyed camelCase) is converted to snake_case by a new
`keysToSnake` recursive helper before being passed to `rpc.call`:

```typescript
params = keysToSnake(formValues.value)   // workingDir → working_dir
```

**3. Inspect panel shows wire format**

`currentParams()` returns `keysToSnake(formValues.value)` so the inspect
panel always displays what is actually sent on the wire (snake_case), making
the mismatch immediately visible if it recurs.

## Design note

The correct long-term boundary is:

```
backend (snake_case)
    ↓ transformKeys on every ingress data item
internal JS / Vue (camelCase)
    ↓ keysToSnake on every egress params object
backend (snake_case)
```

**Schema is data too.** It arrives via RPC and goes through `transformKeys`
like any other response. The schema's `properties` keys end up camelCase,
which is fine for rendering. But `required` is an array of strings (not object
keys), so it escapes the transformation. Any code that cross-references
`required` against `properties` keys must normalise both sides to the same
convention first.

A future improvement would be a dedicated schema-fetch path that either skips
`transformKeys` (keeping the schema in its original snake_case form) or
explicitly normalises `required` entries as part of the schema ingestion step,
rather than patching it in `resolveRefs`.
