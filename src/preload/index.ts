import { contextBridge, ipcRenderer } from 'electron'
import type {
  AiEvent,
  AppSettings,
  ChatMessage,
  CodexAuthStatus,
  GoogleAuthStatus,
  IntradaySnapshot,
  MetricKey,
  PairedDevice,
  SeriesResult,
  SleepRangeResult,
  SyncActivity,
  WorkoutsResult
} from '../shared/types'

const api = {
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
    update: (patch: Partial<AppSettings>): Promise<AppSettings> =>
      ipcRenderer.invoke('settings:update', patch)
  },
  google: {
    status: (): Promise<GoogleAuthStatus> => ipcRenderer.invoke('google:status'),
    connect: (): Promise<GoogleAuthStatus> => ipcRenderer.invoke('google:connect'),
    disconnect: (): Promise<void> => ipcRenderer.invoke('google:disconnect')
  },
  codex: {
    status: (): Promise<CodexAuthStatus> => ipcRenderer.invoke('codex:status'),
    connect: (): Promise<CodexAuthStatus> => ipcRenderer.invoke('codex:connect'),
    disconnect: (): Promise<void> => ipcRenderer.invoke('codex:disconnect')
  },
  health: {
    series: (metrics: MetricKey[], start: string, end: string, force?: boolean): Promise<SeriesResult> =>
      ipcRenderer.invoke('health:series', metrics, start, end, force),
    sleepRange: (start: string, end: string, force?: boolean): Promise<SleepRangeResult> =>
      ipcRenderer.invoke('health:sleep-range', start, end, force),
    workouts: (start: string, end: string, force?: boolean): Promise<WorkoutsResult> =>
      ipcRenderer.invoke('health:workouts', start, end, force),
    intraday: (date: string, force?: boolean): Promise<IntradaySnapshot> =>
      ipcRenderer.invoke('health:intraday', date, force),
    devices: (force?: boolean): Promise<PairedDevice[]> => ipcRenderer.invoke('health:devices', force),
    refresh: (): Promise<void> => ipcRenderer.invoke('health:refresh'),
    onActivity: (callback: (activity: SyncActivity) => void): (() => void) => {
      const listener = (_: unknown, activity: SyncActivity): void => callback(activity)
      ipcRenderer.on('health:activity', listener)
      return () => ipcRenderer.removeListener('health:activity', listener)
    }
  },
  ai: {
    send: (chatId: string, history: ChatMessage[]): Promise<void> =>
      ipcRenderer.invoke('ai:send', chatId, history),
    onEvent: (callback: (event: AiEvent) => void): (() => void) => {
      const listener = (_: unknown, event: AiEvent): void => callback(event)
      ipcRenderer.on('ai:event', listener)
      return () => ipcRenderer.removeListener('ai:event', listener)
    }
  }
}

export type PulseApi = typeof api

contextBridge.exposeInMainWorld('pulse', api)
