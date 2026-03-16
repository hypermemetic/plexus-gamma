<template>
  <div class="detail">
    <div v-if="loading && !schema" class="detail-loading">
      <span class="spinner">◌</span> Loading schema…
    </div>

    <div v-else-if="error" class="detail-error">{{ error }}</div>

    <template v-else-if="schema">
      <header class="detail-header">
        <div class="detail-path">
          <button
            v-for="(seg, i) in path"
            :key="i"
            class="path-segment path-btn"
            @click="$emit('navigate', path.slice(0, i + 1))"
          >
            <span v-if="i > 0" class="path-sep">.</span>{{ seg }}
          </button>
          <button
            v-if="path.length === 0"
            class="path-segment root path-btn"
            @click="$emit('navigate', [])"
          >{{ backendName }}</button>
        </div>
        <div class="detail-meta">
          <span class="version-badge">v{{ schema.version }}</span>
          <span class="hash-badge" :title="schema.hash">{{ schema.hash.slice(0, 8) }}</span>
          <span class="kind-badge" :class="schema.children !== undefined ? 'hub' : 'leaf'">
            {{ schema.children !== undefined ? 'hub' : 'leaf' }}
          </span>
        </div>
      </header>

      <p class="description">{{ schema.description }}</p>
      <p v-if="schema.long_description" class="long-description">{{ schema.long_description }}</p>

      <!-- Children summary -->
      <section v-if="schema.children?.length" class="section">
        <h3 class="section-title">Children ({{ schema.children.length }})</h3>
        <div class="child-list">
          <button
            v-for="child in schema.children"
            :key="child.namespace"
            class="child-chip"
            @click="$emit('navigate', [...path, child.namespace])"
          >
            {{ child.namespace }}
            <span class="child-hash">{{ child.hash.slice(0, 6) }}</span>
          </button>
        </div>
      </section>

      <!-- Methods -->
      <section v-if="schema.methods.length" class="section">
        <h3 class="section-title">Methods ({{ schema.methods.length }})</h3>
        <div class="method-list">
          <template v-for="method in schema.methods" :key="method.name">
            <MethodInvoker
              :method="method"
              :namespace="namespace"
              :backend-name="backendName"
            />
            <!-- features: remove any line below to disable that feature -->
            <AgentTranscript :method="method" :namespace="namespace" :backend-name="backendName" />
            <BatchRunner     :method="method" :namespace="namespace" :backend-name="backendName" />
            <AssertionSuite  :method="method" :namespace="namespace" :backend-name="backendName" />
          </template>
        </div>
      </section>

      <div v-if="!schema.methods.length && !schema.children?.length" class="empty-state">
        No methods or children.
      </div>
    </template>

    <div v-else class="welcome">
      <div class="welcome-inner">
        <div class="welcome-icon">⬡</div>
        <h2>plexus-gamma</h2>
        <p>Select a plugin from the tree to inspect its schema.</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject, watch } from 'vue'
import type { PlexusRpcClient } from '../lib/plexus/transport'
import { collectOne } from '../lib/plexus/rpc'
import type { PluginSchema } from '../plexus-schema'
import MethodInvoker from './MethodInvoker.vue'
// ─── Features (remove any import + usage pair to disable) ────
import AgentTranscript from '../features/agent-transcript/AgentTranscript.vue'
import BatchRunner from '../features/batch-runner/BatchRunner.vue'
import AssertionSuite from '../features/assertions/AssertionSuite.vue'

const props = defineProps<{
  path: string[] | null
}>()

const emit = defineEmits<{
  navigate: [path: string[]]
}>()

const rpc         = inject<PlexusRpcClient>('rpc')!
const backendName = inject<string>('backendName')!

const schema  = ref<PluginSchema | null>(null)
const loading = ref(false)
const error   = ref('')

// Dot-joined namespace for this node (used by MethodInvoker)
const namespace = computed(() => {
  if (!props.path) return ''
  return props.path.join('.')
})

let fetchSeq = 0

watch(
  () => props.path,
  async (newPath) => {
    if (newPath === null) { schema.value = null; return }
    const seq = ++fetchSeq
    loading.value = true
    error.value = ''
    try {
      const method = newPath.length === 0
        ? `${backendName}.schema`
        : `${newPath.join('.')}.schema`
      const result = await collectOne<PluginSchema>(rpc.call(method, {}))
      if (seq === fetchSeq) schema.value = result
    } catch (e) {
      if (seq === fetchSeq) error.value = e instanceof Error ? e.message : String(e)
    } finally {
      if (seq === fetchSeq) loading.value = false
    }
  },
  { immediate: true }
)

const path = computed(() => props.path ?? [])
</script>

<style scoped>
.detail {
  flex: 1;
  overflow-y: auto;
  padding: 24px 32px;
  background: var(--bg-0);
}

.detail-loading {
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 20px 0;
}

@keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
.spinner { animation: pulse 1.2s ease-in-out infinite; }

.detail-error { color: var(--red); padding: 20px 0; }

.detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 8px;
  gap: 12px;
}

.detail-path {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-2);
  display: flex;
  align-items: center;
  flex-wrap: wrap;
}

.path-segment { color: var(--text-2); }
.path-segment.root { color: var(--accent); }
.path-sep { color: var(--text-dim); margin: 0 1px; }

.path-btn {
  background: none;
  border: none;
  font-family: inherit;
  font-size: inherit;
  font-weight: inherit;
  color: inherit;
  cursor: pointer;
  padding: 0;
  display: inline-flex;
  align-items: center;
}
.path-btn:hover { text-decoration: underline; }

.detail-meta { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }

.version-badge, .hash-badge, .kind-badge {
  font-size: 11px; padding: 2px 7px; border-radius: 10px; font-family: inherit;
}
.version-badge { background: var(--bg-3); color: var(--text-muted); border: 1px solid var(--border-2); }
.hash-badge    { background: var(--bg-3); color: var(--accent); border: 1px solid #1f3048; cursor: default; }
.kind-badge.hub  { background: var(--accent-bg); color: var(--accent-2); border: 1px solid var(--accent-bg-2); }
.kind-badge.leaf { background: var(--green-bg); color: var(--green); border: 1px solid var(--green-bg); }

.description { color: var(--text-muted); margin: 8px 0 0; line-height: 1.5; }
.long-description { color: var(--text-muted); margin: 6px 0 0; line-height: 1.6; font-size: 12px; }

.section { margin-top: 28px; }

.section-title {
  font-size: 11px; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.08em; color: var(--text-dim); margin: 0 0 10px;
}

.child-list { display: flex; flex-wrap: wrap; gap: 6px; }

.child-chip {
  background: var(--bg-3); border: 1px solid var(--border-2); color: var(--accent-2);
  padding: 4px 10px; border-radius: 6px; cursor: pointer;
  font-family: inherit; font-size: 12px;
  display: flex; align-items: center; gap: 6px;
  transition: border-color 0.1s, background 0.1s;
}
.child-chip:hover { border-color: var(--accent); background: var(--accent-bg); }
.child-hash { color: var(--text-dim); font-size: 10px; }

.method-list { display: flex; flex-direction: column; gap: 8px; }

.welcome { display: flex; align-items: center; justify-content: center; height: 100%; }
.welcome-inner { text-align: center; color: var(--text-dim); }
.welcome-icon { font-size: 48px; margin-bottom: 12px; }
.welcome-inner h2 { color: var(--text-muted); margin: 0 0 8px; font-size: 20px; }
.welcome-inner p { margin: 0; font-size: 13px; }

.empty-state { color: var(--text-dim); margin-top: 24px; }
</style>
