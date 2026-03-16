import { ref } from 'vue'

export type ViewName = 'multi-explorer' | 'canvas' | 'sheet' | 'wiring' | 'orchestration'
export const VALID_VIEWS: ViewName[] = ['multi-explorer', 'canvas', 'sheet', 'wiring', 'orchestration']

// Restore from localStorage if available (SSR-safe guard)
const _savedView = typeof localStorage !== 'undefined'
  ? (localStorage.getItem('plexus-active-view') as ViewName | null)
  : null
const _savedTheme = typeof localStorage !== 'undefined'
  ? (localStorage.getItem('plexus-theme') as 'daylight' | 'midnight' | null)
  : null

const currentView  = ref<ViewName>(VALID_VIEWS.includes(_savedView!) ? _savedView! : 'multi-explorer')
const theme        = ref<'daylight' | 'midnight'>(_savedTheme ?? 'midnight')
const paletteOpen  = ref(false)
const navigateTo   = ref<{ backend: string; path: string[] } | null>(null)

export function useUiState() {
  return { currentView, theme, paletteOpen, navigateTo }
}
