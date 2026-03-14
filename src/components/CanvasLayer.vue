<template>
  <div ref="el" class="canvas-layer">
    <div class="canvas-layer-content" :style="{ transform }">
      <slot name="content" />
    </div>
    <div class="canvas-layer-overlay">
      <slot name="overlay" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

defineProps<{ transform: string }>()

const el = ref<HTMLElement | null>(null)
defineExpose({ el })
</script>

<style scoped>
.canvas-layer {
  position: relative;
  overflow: clip;
  min-width: 0;
  outline: none;
}

.canvas-layer-content {
  position: absolute;
  inset: 0;
  transform-origin: 0 0;
  will-change: transform;
}

.canvas-layer-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
</style>
