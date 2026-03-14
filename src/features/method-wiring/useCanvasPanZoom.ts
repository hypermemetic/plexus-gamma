import { ref, computed } from 'vue'
import type { Ref, ComputedRef } from 'vue'

export function useCanvasPanZoom(): {
  pan: Ref<{ x: number; y: number }>
  zoom: Ref<number>
  isPanning: Ref<boolean>
  transformStyle: ComputedRef<string>
  onWheel(e: WheelEvent, rect: DOMRect): void
  onPanStart(e: MouseEvent): boolean
  onPanMove(e: MouseEvent): void
  onPanEnd(): void
  onKeyDown(e: KeyboardEvent): void
  onKeyUp(e: KeyboardEvent): void
  screenToCanvas(sx: number, sy: number, rect: DOMRect): { x: number; y: number }
  canvasToScreen(cx: number, cy: number, rect: DOMRect): { x: number; y: number }
  panTo(cx: number, cy: number, rect: DOMRect): void
  reset(): void
} {
  const pan = ref<{ x: number; y: number }>({ x: 0, y: 0 })
  const zoom = ref(1)
  const isPanning = ref(false)
  const spaceHeld = ref(false)

  interface PanStart { mouseX: number; mouseY: number; panX: number; panY: number }
  let panStart: PanStart | null = null

  const transformStyle = computed(
    () => `translate(${pan.value.x}px,${pan.value.y}px) scale(${zoom.value})`
  )

  function clampZoom(z: number): number {
    return Math.max(0.25, Math.min(4.0, z))
  }

  function onWheel(e: WheelEvent, rect: DOMRect): void {
    const newZoom = clampZoom(zoom.value * (1 - e.deltaY * 0.003))
    // Zoom toward cursor: keep the canvas point under cursor fixed
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    pan.value = {
      x: cx - (cx - pan.value.x) * newZoom / zoom.value,
      y: cy - (cy - pan.value.y) * newZoom / zoom.value,
    }
    zoom.value = newZoom
  }

  function onPanStart(e: MouseEvent): boolean {
    const shouldPan = e.button === 1 || (e.button === 0 && spaceHeld.value)
    if (shouldPan) {
      panStart = { mouseX: e.clientX, mouseY: e.clientY, panX: pan.value.x, panY: pan.value.y }
      isPanning.value = true
      return true
    }
    return false
  }

  function onPanMove(e: MouseEvent): void {
    if (!panStart) return
    pan.value = {
      x: panStart.panX + (e.clientX - panStart.mouseX),
      y: panStart.panY + (e.clientY - panStart.mouseY),
    }
  }

  function onPanEnd(): void {
    panStart = null
    isPanning.value = false
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.code === 'Space') spaceHeld.value = true
  }

  function onKeyUp(e: KeyboardEvent): void {
    if (e.code === 'Space') spaceHeld.value = false
  }

  function screenToCanvas(sx: number, sy: number, rect: DOMRect): { x: number; y: number } {
    return {
      x: (sx - rect.left - pan.value.x) / zoom.value,
      y: (sy - rect.top  - pan.value.y) / zoom.value,
    }
  }

  function canvasToScreen(cx: number, cy: number, rect: DOMRect): { x: number; y: number } {
    return {
      x: cx * zoom.value + pan.value.x + rect.left,
      y: cy * zoom.value + pan.value.y + rect.top,
    }
  }

  function panTo(cx: number, cy: number, rect: DOMRect): void {
    pan.value = {
      x: rect.width  / 2 - cx * zoom.value,
      y: rect.height / 2 - cy * zoom.value,
    }
  }

  function reset(): void {
    pan.value = { x: 0, y: 0 }
    zoom.value = 1
  }

  return {
    pan, zoom, isPanning, transformStyle,
    onWheel, onPanStart, onPanMove, onPanEnd,
    onKeyDown, onKeyUp,
    screenToCanvas, canvasToScreen, panTo, reset,
  }
}
