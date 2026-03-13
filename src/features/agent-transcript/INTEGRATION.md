# AgentTranscript — Integration Guide

Add 3 lines to `src/components/PluginDetail.vue` to activate the chat UI for any
method named `chat`.

## 1. Import (add after the existing `MethodInvoker` import)

```ts
import AgentTranscript from '../features/agent-transcript/AgentTranscript.vue'
```

## 2. Template usage (add immediately after `<MethodInvoker … />` inside the `v-for` loop)

```html
<AgentTranscript :method="method" :namespace="namespace" :backend-name="backendName" />
```

### Full diff context

The relevant section of `PluginDetail.vue` currently reads:

```html
        <MethodInvoker
          v-for="method in schema.methods"
          :key="method.name"
          :method="method"
          :namespace="namespace"
          :backend-name="backendName"
        />
```

After the change it should read:

```html
        <MethodInvoker
          v-for="method in schema.methods"
          :key="method.name"
          :method="method"
          :namespace="namespace"
          :backend-name="backendName"
        />
        <AgentTranscript
          v-for="method in schema.methods"
          :key="`at-${method.name}`"
          :method="method"
          :namespace="namespace"
          :backend-name="backendName"
        />
```

`AgentTranscript` is a no-op for every method whose `name` is not `chat`, so
placing it in the same loop is safe and requires no conditional logic at the
call site.
