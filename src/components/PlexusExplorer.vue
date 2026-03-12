<template>
  <div class="explorer">
    <!-- Sidebar: tree -->
    <aside class="sidebar">
      <div class="sidebar-header">
        <span class="backend-label">substrate</span>
        <button class="refresh-btn" :disabled="loading" @click="refresh" title="Refresh tree">
          <span :class="{ spinning: loading }">↻</span>
        </button>
      </div>

      <div v-if="error" class="error-banner">{{ error }}</div>

      <div v-if="loading && !tree" class="loading-state">
        <span class="spinner">◌</span> Scanning…
      </div>

      <nav v-if="tree" class="tree">
        <TreeNode
          :node="tree"
          :selected-path="selectedPath"
          @select="selectNode"
        />
      </nav>
    </aside>

    <!-- Main: plugin detail -->
    <main class="detail">
      <template v-if="selected">
        <header class="detail-header">
          <div class="detail-path">
            <span
              v-for="(seg, i) in selected.path"
              :key="i"
              class="path-segment"
            >
              <span v-if="i > 0" class="path-sep">.</span>{{ seg }}
            </span>
            <span v-if="selected.path.length === 0" class="path-segment root">substrate</span>
          </div>
          <div class="detail-meta">
            <span class="version-badge">v{{ selected.schema.version }}</span>
            <span class="hash-badge" :title="selected.schema.hash">
              {{ selected.schema.hash.slice(0, 8) }}
            </span>
            <span class="kind-badge" :class="isHub(selected.schema) ? 'hub' : 'leaf'">
              {{ isHub(selected.schema) ? 'hub' : 'leaf' }}
            </span>
          </div>
        </header>

        <p class="description">{{ selected.schema.description }}</p>
        <p v-if="selected.schema.long_description" class="long-description">
          {{ selected.schema.long_description }}
        </p>

        <!-- Children summary -->
        <section v-if="selected.schema.children?.length" class="section">
          <h3 class="section-title">Children ({{ selected.schema.children.length }})</h3>
          <div class="child-list">
            <button
              v-for="child in selected.schema.children"
              :key="child.namespace"
              class="child-chip"
              @click="selectByPath([...selected!.path, child.namespace])"
            >
              {{ child.namespace }}
              <span class="child-hash">{{ child.hash.slice(0, 6) }}</span>
            </button>
          </div>
        </section>

        <!-- Methods -->
        <section v-if="selected.schema.methods.length" class="section">
          <h3 class="section-title">Methods ({{ selected.schema.methods.length }})</h3>
          <div class="method-list">
            <div
              v-for="method in selected.schema.methods"
              :key="method.name"
              class="method-card"
            >
              <div class="method-header">
                <code class="method-name">{{ method.name }}</code>
                <div class="method-tags">
                  <span v-if="method.streaming" class="tag stream">stream</span>
                  <span v-if="method.bidirectional" class="tag bidir">bidir</span>
                </div>
              </div>
              <p class="method-desc">{{ method.description }}</p>
              <div v-if="method.params" class="schema-block">
                <span class="schema-label">params</span>
                <pre class="schema-json">{{ JSON.stringify(method.params, null, 2) }}</pre>
              </div>
              <div v-if="method.returns" class="schema-block">
                <span class="schema-label">returns</span>
                <pre class="schema-json">{{ JSON.stringify(method.returns, null, 2) }}</pre>
              </div>
            </div>
          </div>
        </section>

        <div v-if="!selected.schema.methods.length && !selected.schema.children?.length" class="empty-state">
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
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { PlexusRpcClient } from '../lib/plexus/transport'
import { buildTree } from '../schema-walker'
import { isHub } from '../plexus-schema'
import type { PluginNode } from '../plexus-schema'
import TreeNode from './TreeNode.vue'

const rpc = new PlexusRpcClient({
  backend: 'substrate',
  url: 'ws://127.0.0.1:4444',
})

const tree = ref<PluginNode | null>(null)
const selected = ref<PluginNode | null>(null)
const selectedPath = ref<string>('')
const loading = ref(false)
const error = ref('')

async function refresh() {
  loading.value = true
  error.value = ''
  try {
    await rpc.connect()
    tree.value = await buildTree(rpc)
    // Re-select after refresh if path still exists
    if (selected.value) {
      selectByPath(selected.value.path)
    } else {
      selectNode(tree.value)
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

function selectNode(node: PluginNode) {
  selected.value = node
  selectedPath.value = node.path.join('.')
}

function selectByPath(path: string[]) {
  if (!tree.value) return
  const target = findNode(tree.value, path)
  if (target) selectNode(target)
}

function findNode(node: PluginNode, path: string[]): PluginNode | null {
  if (node.path.join('.') === path.join('.')) return node
  for (const child of node.children) {
    const found = findNode(child, path)
    if (found) return found
  }
  return null
}

onMounted(refresh)
</script>

<style scoped>
.explorer {
  display: flex;
  height: 100vh;
  overflow: hidden;
  font-family: 'Berkeley Mono', 'Fira Code', 'Cascadia Code', ui-monospace, monospace;
  font-size: 13px;
  background: #0d0d0f;
  color: #c9d1d9;
}

/* ── Sidebar ─────────────────────────────────────────────── */
.sidebar {
  width: 260px;
  flex-shrink: 0;
  background: #111114;
  border-right: 1px solid #21262d;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid #21262d;
}

.backend-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #58a6ff;
}

.refresh-btn {
  background: none;
  border: none;
  color: #8b949e;
  cursor: pointer;
  font-size: 16px;
  padding: 2px 4px;
  border-radius: 4px;
  line-height: 1;
}
.refresh-btn:hover:not(:disabled) { color: #c9d1d9; background: #21262d; }
.refresh-btn:disabled { opacity: 0.4; cursor: default; }

@keyframes spin { to { transform: rotate(360deg); } }
.spinning { display: inline-block; animation: spin 0.8s linear infinite; }

.error-banner {
  padding: 8px 14px;
  background: #2d1117;
  color: #f85149;
  font-size: 11px;
  border-bottom: 1px solid #3d2121;
}

.loading-state {
  padding: 20px 14px;
  color: #8b949e;
  display: flex;
  align-items: center;
  gap: 6px;
}

@keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
.spinner { animation: pulse 1.2s ease-in-out infinite; }

.tree {
  flex: 1;
  overflow-y: auto;
  padding: 6px 0;
}

/* ── Detail pane ─────────────────────────────────────────── */
.detail {
  flex: 1;
  overflow-y: auto;
  padding: 24px 32px;
  background: #0d0d0f;
}

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
  gap: 0;
}

.path-segment { color: #e6edf3; }
.path-segment.root { color: #58a6ff; }
.path-sep { color: #484f58; margin: 0 1px; }

.detail-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.version-badge, .hash-badge, .kind-badge {
  font-size: 11px;
  padding: 2px 7px;
  border-radius: 10px;
  font-family: inherit;
}

.version-badge { background: #161b22; color: #8b949e; border: 1px solid #30363d; }
.hash-badge { background: #161b22; color: #58a6ff; border: 1px solid #1f3048; cursor: default; }
.kind-badge.hub { background: #1a2840; color: #79c0ff; border: 1px solid #1f3a5f; }
.kind-badge.leaf { background: #172420; color: #3fb950; border: 1px solid #1f4030; }

.description {
  color: #8b949e;
  margin: 8px 0 0;
  line-height: 1.5;
}

.long-description {
  color: #8b949e;
  margin: 6px 0 0;
  line-height: 1.6;
  font-size: 12px;
}

/* ── Sections ────────────────────────────────────────────── */
.section { margin-top: 28px; }

.section-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #484f58;
  margin: 0 0 10px;
}

/* Children */
.child-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.child-chip {
  background: #161b22;
  border: 1px solid #30363d;
  color: #79c0ff;
  padding: 4px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: border-color 0.1s, background 0.1s;
}
.child-chip:hover { border-color: #58a6ff; background: #1a2840; }
.child-hash { color: #484f58; font-size: 10px; }

/* Methods */
.method-list { display: flex; flex-direction: column; gap: 12px; }

.method-card {
  background: #111114;
  border: 1px solid #21262d;
  border-radius: 8px;
  padding: 14px 16px;
}

.method-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.method-name { color: #d2a8ff; font-size: 13px; }

.method-tags { display: flex; gap: 5px; }

.tag {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 8px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.tag.stream { background: #1a2840; color: #58a6ff; }
.tag.bidir  { background: #271a3a; color: #bc8cff; }

.method-desc { color: #8b949e; margin: 0 0 10px; line-height: 1.5; font-size: 12px; }

.schema-block { margin-top: 8px; }
.schema-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #484f58;
  display: block;
  margin-bottom: 4px;
}
.schema-json {
  background: #0d1117;
  border: 1px solid #21262d;
  border-radius: 6px;
  padding: 10px 12px;
  font-size: 11px;
  color: #c9d1d9;
  overflow-x: auto;
  margin: 0;
  line-height: 1.5;
}

/* Welcome / empty */
.welcome {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}
.welcome-inner {
  text-align: center;
  color: #484f58;
}
.welcome-icon { font-size: 48px; margin-bottom: 12px; }
.welcome-inner h2 { color: #8b949e; margin: 0 0 8px; font-size: 20px; }
.welcome-inner p { margin: 0; font-size: 13px; }

.empty-state { color: #484f58; margin-top: 24px; }
</style>
