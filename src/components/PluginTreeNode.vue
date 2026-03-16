<template>
  <div class="node">
    <button
      class="node-row"
      :class="{ selected: isSelected, hub: hasChildren, leaf: !hasChildren, root: isRoot }"
      @click="toggle"
    >
      <span class="node-toggle">
        <template v-if="hasChildren">{{ open ? '▾' : '▸' }}</template>
        <template v-else>·</template>
      </span>
      <span class="node-label">{{ label }}</span>
      <span v-if="hasChildren" class="node-count">{{ node.children.length }}</span>
    </button>

    <div v-if="open && hasChildren" class="node-children">
      <PluginTreeNode
        v-for="child in node.children"
        :key="child.path.join('.')"
        :node="child"
        :selected-path="selectedPath"
        :backend-name="backendName"
        @select="$emit('select', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { PluginNode } from '../plexus-schema'

const props = defineProps<{
  node: PluginNode
  selectedPath: string
  backendName: string
}>()

const emit = defineEmits<{
  select: [node: PluginNode]
}>()

const open = ref(props.node.path.length === 0) // root starts open

const label       = computed(() =>
  props.node.path.length === 0 ? props.backendName : props.node.path[props.node.path.length - 1]
)
const isRoot      = computed(() => props.node.path.length === 0)
const hasChildren = computed(() => props.node.children.length > 0)
const isSelected  = computed(() => props.node.path.join('.') === props.selectedPath)

function toggle() {
  if (hasChildren.value) open.value = !open.value
  emit('select', props.node)
}
</script>

<style scoped>
.node { user-select: none; }

.node-row {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  padding: 3px 8px 3px 14px;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-muted);
  font-family: inherit;
  font-size: 12px;
  text-align: left;
  border-radius: 0;
  transition: background 0.08s, color 0.08s;
  white-space: nowrap;
  overflow: hidden;
}

.node-row:hover { background: var(--bg-3); color: var(--text); }
.node-row.selected { background: var(--accent-bg); color: var(--accent); }
.node-row.hub { color: var(--text); }
.node-row.root {
  color: var(--accent);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  padding-left: 10px;
  border-bottom: 1px solid var(--border);
  background: var(--accent-bg);
}
.node-row.root:hover { background: var(--accent-bg-2); color: var(--accent); }
.node-row.root.selected { background: var(--accent-bg-2); }
.node-row.leaf { padding-left: 22px; }
.node-row.selected.leaf { color: var(--accent); }

.node-toggle { font-size: 10px; width: 10px; flex-shrink: 0; color: var(--text-dim); text-align: center; }
.node-row.selected .node-toggle { color: var(--accent); }

.node-label { flex: 1; overflow: hidden; text-overflow: ellipsis; }
.node-count { font-size: 10px; color: var(--text-dim); flex-shrink: 0; }

.node-children { padding-left: 12px; }
</style>
