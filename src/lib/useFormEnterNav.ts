import { onMounted, onUnmounted, type Ref } from 'vue'

const FOCUSABLE = 'input:not([type=hidden]), select, textarea'

export function useFormEnterNav(
  containerRef: Ref<HTMLElement | null>,
  onSubmit: () => void,
): void {
  function handler(e: KeyboardEvent) {
    if (e.key !== 'Enter') return
    const container = containerRef.value
    if (!container) return
    const target = e.target as HTMLElement
    if (!container.contains(target)) return

    // Checkboxes: advance without submitting
    if ((target as HTMLInputElement).type === 'checkbox') {
      e.preventDefault()
      const inputs = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE))
      const idx = inputs.indexOf(target)
      if (idx >= 0 && idx < inputs.length - 1) inputs[idx + 1].focus()
      return
    }

    // Textareas: allow natural newlines (Ctrl+Enter is handled separately)
    if (target.tagName === 'TEXTAREA') return

    e.preventDefault()
    const inputs = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE))
    const idx = inputs.indexOf(target)
    if (idx >= 0 && idx < inputs.length - 1) {
      inputs[idx + 1].focus()
    } else {
      onSubmit()
    }
  }

  onMounted(()   => document.addEventListener('keydown', handler, true))
  onUnmounted(() => document.removeEventListener('keydown', handler, true))
}
