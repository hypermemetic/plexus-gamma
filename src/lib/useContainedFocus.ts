export function useContainedFocus() {
  function focus(el: HTMLElement | null | undefined) {
    el?.focus({ preventScroll: true })
  }
  return { focus }
}
