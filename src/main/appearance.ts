import { nativeTheme } from 'electron'
import { isAppearanceMode, type AppearanceState } from '../shared/appearance'
import { getAppearancePreference, updateAppearancePreference } from './store'

let publish: (state: AppearanceState) => void = () => {}
let previous: AppearanceState | undefined

export function getAppearanceState(): AppearanceState {
  return {
    mode: getAppearancePreference(),
    resolved: nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  }
}

function notify(): void {
  const state = getAppearanceState()
  if (state.mode === previous?.mode && state.resolved === previous.resolved) return
  previous = state
  publish(state)
}

export function initializeAppearance(onChanged: (state: AppearanceState) => void): () => void {
  nativeTheme.themeSource = getAppearancePreference()
  previous = getAppearanceState()
  publish = onChanged
  nativeTheme.on('updated', notify)
  return () => {
    nativeTheme.removeListener('updated', notify)
    publish = () => {}
  }
}

export function setAppearanceMode(mode: unknown): AppearanceState {
  if (!isAppearanceMode(mode)) throw new Error('Unknown appearance mode.')
  updateAppearancePreference(mode)
  applyAppearancePreference()
  return getAppearanceState()
}

/** Also keeps native appearance in sync when another settings field is saved. */
export function applyAppearancePreference(): void {
  nativeTheme.themeSource = getAppearancePreference()
  notify()
}
