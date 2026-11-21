// The running health export lives here rather than in the Settings card, so
// leaving Settings doesn't cancel a long export and coming back shows it.
import { useSyncExternalStore } from 'react'
import type { HealthExportOptions, HealthExportProgress } from '@shared/health-export'

export interface HealthExportRunState {
  running: boolean
  progress: HealthExportProgress | null
  saved: { name: string; bytes: number } | null
  failure: string | null
}

const IDLE: HealthExportRunState = { running: false, progress: null, saved: null, failure: null }

let state = IDLE
let requestId: string | null = null
// Only a cancel the user asked for ends quietly; any other abort is explained.
let userCancelled = false
const listeners = new Set<() => void>()

function set(patch: Partial<HealthExportRunState>): void {
  state = { ...state, ...patch }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const snapshot = (): HealthExportRunState => state

export function useHealthExportRun(): HealthExportRunState {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}

export async function startHealthExport(options: HealthExportOptions): Promise<void> {
  if (state.running) return
  const id = `export-${Date.now()}`
  requestId = id
  userCancelled = false
  set({ running: true, progress: null, saved: null, failure: null })
  const stopProgress = window.pulse.health.onExportProgress((progress) => {
    if (requestId === id) set({ progress })
  })
  try {
    const result = await window.pulse.health.export(id, options)
    if (result.status === 'saved') {
      set({ saved: { name: result.path.split(/[\\/]/).pop() ?? result.path, bytes: result.bytes } })
    }
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'AbortError')) {
      set({ failure: error instanceof Error && error.message.trim() ? error.message : 'The export could not be completed.' })
    } else if (!userCancelled) {
      set({ failure: 'The export stopped because the Google Health connection changed. Try again.' })
    }
  } finally {
    stopProgress()
    if (requestId === id) requestId = null
    set({ running: false, progress: null })
  }
}

export function cancelHealthExport(): void {
  if (!requestId) return
  userCancelled = true
  void window.pulse.health.cancel(requestId)
}

/** Forgets the last result once the choices change, so it can't be mistaken for the new ones. */
export function clearHealthExportResult(): void {
  if (!state.running && (state.saved || state.failure)) set({ saved: null, failure: null })
}
