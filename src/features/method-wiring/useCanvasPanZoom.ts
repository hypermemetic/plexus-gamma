import { ref, computed } from 'vue'
import type { Ref, ComputedRef } from 'vue'

export type PanelMode = 'float' | 'right' | 'bottom'

export function useCanvasPanZoom(): {
  pan: Ref<{ x: number; y: number }>
  zoom: Ref<number>
  isPanning: Ref<boolean>
  transformStyle: ComputedRef<string>
  onWheel(e: WheelEvent, rect: DOMRect): void
  onPanStart(e: MouseEvent): boolean
  beginPan(e: MouseEvent): void
  onPanMove(e: MouseEvent): boolean
  onPanEnd(): void
  onKeyDown(e: KeyboardEvent): void
  onKeyUp(e: KeyboardEvent): void
  onTouchStart(e: TouchEvent, rect: DOMRect): void
  onTouchMove(e: TouchEvent, rect: DOMRect): void
  onTouchEnd(e: TouchEvent): void
  screenToCanvas(sx: number, sy: number, rect: DOMRect): { x: number; y: number }
  canvasToScreen(cx: number, cy: number, rect: DOMRect): { x: number; y: number }
  panTo(cx: number, cy: number, rect: DOMRect): void
  reset(): void
} {
  const pan = ref<{ x: number; y: number }>({ x: 0, y: 0 })
  const zoom = ref(1)
  const isPanning = ref(false)
  const spaceHeld = ref(false)

  const PAN_THRESHOLD = 5 // px — minimum drag distance before pan activates

  interface PanState { mouseX: number; mouseY: number; panX: number; panY: number }
  let panState: PanState | null = null
  let pendingPan: PanState | null = null // waiting for threshold (beginPan only)

  // Touch state
  interface TouchPanState { x: number; y: number; panX: number; panY: number }
  interface PinchState { dist: number; zoom: number; pan: { x: number; y: number }; midX: number; midY: number }
  let touchPan: TouchPanState | null = null
  let pinchStart: PinchState | null = null

  const transformStyle = computed(
    () => `translate(${pan.value.x}px,${pan.value.y}px) scale(${zoom.value})`
  )

  function clampZoom(z: number): number {
    return Math.max(0.25, Math.min(4.0, z))
  }

  function onWheel(e: WheelEvent, rect: DOMRect): void {
    const newZoom = clampZoom(zoom.value * (1 - e.deltaY * 0.008))
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    pan.value = {
      x: cx - (cx - pan.value.x) * newZoom / zoom.value,
      y: cy - (cy - pan.value.y) * newZoom / zoom.value,
    }
    zoom.value = newZoom
  }

  // Legacy: middle-click or space+drag
  function onPanStart(e: MouseEvent): boolean {
    const shouldPan = e.button === 1 || (e.button === 0 && spaceHeld.value)
    if (shouldPan) {
      panState = { mouseX: e.clientX, mouseY: e.clientY, panX: pan.value.x, panY: pan.value.y }
      isPanning.value = true
      return true
    }
    return false
  }

  // Any left-click on empty canvas — activates only after moving PAN_THRESHOLD px
  function beginPan(e: MouseEvent): void {
    pendingPan = { mouseX: e.clientX, mouseY: e.clientY, panX: pan.value.x, panY: pan.value.y }
  }

  function onPanMove(e: MouseEvent): boolean {
    if (pendingPan && !panState) {
      const dx = e.clientX - pendingPan.mouseX
      const dy = e.clientY - pendingPan.mouseY
      if (Math.hypot(dx, dy) >= PAN_THRESHOLD) {
        panState = pendingPan
        pendingPan = null
        isPanning.value = true
      }
    }
    if (!panState) return false
    pan.value = {
      x: panState.panX + (e.clientX - panState.mouseX),
      y: panState.panY + (e.clientY - panState.mouseY),
    }
    return true
  }

  function onPanEnd(): void {
    panState = null
    pendingPan = null
    isPanning.value = false
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.code === 'Space') spaceHeld.value = true
  }

  function onKeyUp(e: KeyboardEvent): void {
    if (e.code === 'Space') spaceHeld.value = false
  }

  // ─── Touch handlers ──────────────────────────────────────────
  function onTouchStart(e: TouchEvent, rect: DOMRect): void {
    const t0 = e.touches[0]
    const t1 = e.touches[1]
    if (e.touches.length === 1 && t0) {
      touchPan = { x: t0.clientX, y: t0.clientY, panX: pan.value.x, panY: pan.value.y }
      pinchStart = null
      isPanning.value = true
    } else if (e.touches.length === 2 && t0 && t1) {
      touchPan = null
      const dx = t0.clientX - t1.clientX
      const dy = t0.clientY - t1.clientY
      pinchStart = {
        dist: Math.hypot(dx, dy),
        zoom: zoom.value,
        pan: { ...pan.value },
        midX: (t0.clientX + t1.clientX) / 2 - rect.left,
        midY: (t0.clientY + t1.clientY) / 2 - rect.top,
      }
    }
  }

  function onTouchMove(e: TouchEvent, _rect: DOMRect): void {
    const t0 = e.touches[0]
    const t1 = e.touches[1]
    if (e.touches.length === 1 && touchPan && t0) {
      pan.value = {
        x: touchPan.panX + (t0.clientX - touchPan.x),
        y: touchPan.panY + (t0.clientY - touchPan.y),
      }
    } else if (e.touches.length === 2 && pinchStart && t0 && t1) {
      const dx = t0.clientX - t1.clientX
      const dy = t0.clientY - t1.clientY
      const dist = Math.hypot(dx, dy)
      const newZoom = clampZoom(pinchStart.zoom * (dist / pinchStart.dist))
      const { midX, midY } = pinchStart
      pan.value = {
        x: midX - (midX - pinchStart.pan.x) * newZoom / pinchStart.zoom,
        y: midY - (midY - pinchStart.pan.y) * newZoom / pinchStart.zoom,
      }
      zoom.value = newZoom
    }
  }

  function onTouchEnd(e: TouchEvent): void {
    const t0 = e.touches[0]
    if (e.touches.length === 0) {
      touchPan = null
      pinchStart = null
      isPanning.value = false
    } else if (e.touches.length === 1 && t0) {
      // Transition from 2→1 finger: restart single-finger pan
      pinchStart = null
      touchPan = { x: t0.clientX, y: t0.clientY, panX: pan.value.x, panY: pan.value.y }
    }
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
    onWheel, onPanStart, beginPan, onPanMove, onPanEnd,
    onKeyDown, onKeyUp,
    onTouchStart, onTouchMove, onTouchEnd,
    screenToCanvas, canvasToScreen, panTo, reset,
  }
}
