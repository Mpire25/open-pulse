import { useSyncExternalStore } from 'react'
import type { AppearanceMode, AppearanceState } from '@shared/appearance'

let state: AppearanceState = { mode: 'dark', resolved: 'dark' }
let revision = 0
const listeners = new Set<() => void>()

function apply(next: AppearanceState): void {
  revision++
  document.documentElement.dataset.appearance = next.resolved
  document.documentElement.style.colorScheme = next.resolved
  if (state.mode === next.mode && state.resolved === next.resolved) return
  state = next
  for (const listener of listeners) listener()
}

/** Subscribe before reading so an in-flight startup read cannot undo a newer change. */
export async function initializeAppearance(api: Window['pulse']['appearance'] = window.pulse.appearance): Promise<() => void> {
  const unsubscribe = api.onChanged(apply)
  const started = revision
  try {
    const initial = await api.get()
    if (revision === started) apply(initial)
  } catch (error) {
    unsubscribe()
    throw error
  }
  return unsubscribe
}

export async function saveAppearanceMode(mode: AppearanceMode): Promise<void> {
  const started = revision
  const saved = await window.pulse.appearance.set(mode)
  // The broadcast normally arrives first. Do not overwrite a newer window/OS event.
  if (revision === started) apply(saved)
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function useAppearance(): AppearanceState {
  return useSyncExternalStore(subscribe, () => state)
}
