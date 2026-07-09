import { contextBridge, ipcRenderer } from 'electron'
import type {
  AiEvent,
  AppSettings,
  ChatMessage,
  CodexAuthStatus,
  DashboardToday,
  GoogleAuthStatus,
  PairedDevice,
  SleepNight,
  WeekSeries
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
    today: (): Promise<DashboardToday> => ipcRenderer.invoke('health:today'),
    week: (): Promise<WeekSeries> => ipcRenderer.invoke('health:week'),
    sleep: (nights: number): Promise<SleepNight[]> => ipcRenderer.invoke('health:sleep', nights),
    devices: (): Promise<PairedDevice[]> => ipcRenderer.invoke('health:devices')
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
