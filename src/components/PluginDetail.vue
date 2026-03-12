<template>
  <div class="detail">
    <div v-if="loading && !schema" class="detail-loading">
      <span class="spinner">◌</span> Loading schema…
    </div>

    <div v-else-if="error" class="detail-error">{{ error }}</div>

    <template v-else-if="schema">
      <header class="detail-header">
        <div class="detail-path">
          <span
            v-for="(seg, i) in path"
            :key="i"
            class="path-segment"
          >
            <span v-if="i > 0" class="path-sep">.</span>{{ seg }}
          </span>
          <span v-if="path.length === 0" class="path-segment root">{{ backendName }}</span>
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
          <MethodInvoker
            v-for="method in schema.methods"
            :key="method.name"
            :method="method"
            :namespace="namespace"
            :backend-name="backendName"
          />
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
  background: #0d0d0f;
}

.detail-loading {
  color: #8b949e;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 20px 0;
}

@keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
.spinner { animation: pulse 1.2s ease-in-out infinite; }

.detail-error { color: #f85149; padding: 20px 0; }

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
  color: #e6edf3;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
}

.path-segment { color: #e6edf3; }
.path-segment.root { color: #58a6ff; }
.path-sep { color: #484f58; margin: 0 1px; }

.detail-meta { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }

.version-badge, .hash-badge, .kind-badge {
  font-size: 11px; padding: 2px 7px; border-radius: 10px; font-family: inherit;
}
.version-badge { background: #161b22; color: #8b949e; border: 1px solid #30363d; }
.hash-badge    { background: #161b22; color: #58a6ff; border: 1px solid #1f3048; cursor: default; }
.kind-badge.hub  { background: #1a2840; color: #79c0ff; border: 1px solid #1f3a5f; }
.kind-badge.leaf { background: #172420; color: #3fb950; border: 1px solid #1f4030; }

.description { color: #8b949e; margin: 8px 0 0; line-height: 1.5; }
.long-description { color: #8b949e; margin: 6px 0 0; line-height: 1.6; font-size: 12px; }

.section { margin-top: 28px; }

.section-title {
  font-size: 11px; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.08em; color: #484f58; margin: 0 0 10px;
}

.child-list { display: flex; flex-wrap: wrap; gap: 6px; }

.child-chip {
  background: #161b22; border: 1px solid #30363d; color: #79c0ff;
  padding: 4px 10px; border-radius: 6px; cursor: pointer;
  font-family: inherit; font-size: 12px;
  display: flex; align-items: center; gap: 6px;
  transition: border-color 0.1s, background 0.1s;
}
.child-chip:hover { border-color: #58a6ff; background: #1a2840; }
.child-hash { color: #484f58; font-size: 10px; }

.method-list { display: flex; flex-direction: column; gap: 8px; }

.welcome { display: flex; align-items: center; justify-content: center; height: 100%; }
.welcome-inner { text-align: center; color: #484f58; }
.welcome-icon { font-size: 48px; margin-bottom: 12px; }
.welcome-inner h2 { color: #8b949e; margin: 0 0 8px; font-size: 20px; }
.welcome-inner p { margin: 0; font-size: 13px; }

.empty-state { color: #484f58; margin-top: 24px; }
</style>
