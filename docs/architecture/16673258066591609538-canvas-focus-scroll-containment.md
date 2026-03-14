# Canvas Focus & Scroll Containment

**Date:** 2026-03-14
**Commit:** 985f776

---

## The Bug

Clicking a node on the wiring canvas caused everything to visibly jolt — nodes, edges, the background grid — all shifted a few pixels and then snapped back (or stayed shifted).

The effect was immediate (on the first click), reproducible, and survived multiple attempted fixes (drag threshold, post-flush edge re-render watches, removing layout-shifting DOM elements). The symptom was diagnosed as the panel "moving something" even though it was `position: absolute` inside an `overflow: hidden` container.

---

## Root Cause

`c8c3ee2` added auto-focus to the param panel when a node is selected:

```typescript
function focusFirstField() {
  nextTick(() => {
    const el = panelEl.value?.querySelector<HTMLElement>('input:not([disabled]), ...')
    el?.focus()  // ← culprit
  })
}
```

The canvas container (`.canvas-wrap`) has `overflow: hidden` in CSS. It is `position: relative` and is the containing block for all absolutely-positioned canvas content.

**The behaviour:** Chrome (and Chromium-based browsers) will programmatically adjust `scrollTop` / `scrollLeft` on **any** ancestor element when `focus()` is called — even on ancestors with `overflow: hidden`. The CSS property `overflow: hidden` prevents *user-initiated* scrolling (no scrollbar, gesture blocked) but does **not** prevent *programmatic* scrolling via focus events.

When `el?.focus()` was called on an input inside the param panel:

1. The browser walked up the DOM scroll chain to bring the focused element into view.
2. It found `.canvas-wrap` as a candidate and nudged its `scrollTop` / `scrollLeft` by the offset of the panel input relative to the top-left corner.
3. All `position: absolute` children (nodes, the edge SVG, the mini-map) shifted by that scroll delta.
4. The result was a visible jolt of the entire canvas on every node selection.

The offset was small (often a few pixels) but consistent, compounding across multiple selections.

---

## Fix

Two layers:

### 1. `{ preventScroll: true }` on every programmatic `focus()` call

```typescript
el?.focus({ preventScroll: true })
```

This is the W3C-specified opt-out. It instructs the browser not to scroll any ancestor when focusing this element. All `focus()` calls inside components that live inside a scrollable/clipped container should use this option.

### 2. `overflow: clip` on the canvas container

```css
.canvas-wrap {
  overflow: clip;  /* prevents programmatic scroll from focus events */
}
```

`overflow: clip` is distinct from `overflow: hidden`:

| Property | User scroll | Programmatic scroll (focus, JS) |
|---|---|---|
| `overflow: hidden` | ✗ blocked | ✓ **allowed** |
| `overflow: clip` | ✗ blocked | ✗ **blocked** |

`overflow: clip` creates a true paint containment boundary. No scroll container is created. Focus events, `scrollIntoView()`, and `element.scrollTop = N` all have no effect. This is the belt-and-suspenders fix: even if a future `focus()` call forgets `{ preventScroll: true }`, the canvas will not shift.

Browser support: Chrome 90+, Firefox 102+, Safari 16+. Acceptable for a desktop-first tool.

---

## Pattern: Overlay Components Inside Non-Scroll Containers

Any component that:
- renders inside a container that is **not** intended to scroll (canvas areas, fixed panels, modal backdrops)
- programmatically focuses an input or textarea

must use `focus({ preventScroll: true })`. This includes:

- Auto-focus on mount or prop change
- Tab / Enter key focus advancement
- `defineExpose({ focus })` implementations

And any such container should use `overflow: clip` rather than `overflow: hidden` when it contains focusable elements.

---

## Wasted Debugging Paths

For future reference, the following were investigated and ruled out before finding the real cause:

- **Drag threshold** — nodes moving on tiny click-drag movements (fixed separately, but not the jolt)
- **Edge render timing** — `getBoundingClientRect()` called during Vue render before DOM commit (real issue for drag, not for click-jolt)
- **Panel layout influence** — `position: absolute` panels inside `overflow: hidden` containers cannot affect sibling layout
- **CSS selection class changing node size** — `.wire-node.selected` only changes `border-color` and `box-shadow`, not dimensions
- **`returns-section` DOM change** — height change on selection (fixed separately)
- **ResizeObserver reacting to panel** — SVG dimensions only update on canvas-wrap resize, not panel slide-in
- **Z-index stacking** — panel at z-index 300 is above canvas-content as expected

---

## Resulting Abstractions

Three abstractions encode this fix structurally:

- **`src/lib/useContainedFocus.ts`** — composable wrapping `focus({ preventScroll: true })`.
  All programmatic focus calls in the codebase go through this.

- **`src/components/CanvasLayer.vue`** — canvas container primitive with `overflow: clip`,
  a `#content` slot (pan/zoom transformed) and an `#overlay` slot (untransformed, for panels
  and UI chrome). Future canvas surfaces start with the correct containment for free.

- **`src/components/FloatPanel.vue`** — panel positioning/animation/drag/close primitive.
  Positions against container bounds (not window). All panels that float, slide right, or
  sheet up from the bottom use this; none re-implement the logic.
