import { contextBridge, ipcRenderer } from 'electron'
import { healthWireArgs, isHealthCancelled } from '../shared/health-ipc'
import type {
  ActivityIntradayMetric,
  ActivityIntradayResult,
  AiEvent,
  AppSettings,
  BodyMeasurementsResult,
  ChatHistorySnapshot,
  ChatMessage,
  ChatSession,
  ChatSessionMessage,
  CodexAuthStatus,
  GoogleAuthStatus,
  HeartDetailMetric,
  HeartDetailResult,
  HeartDetailScope,
  IntradaySnapshot,
  IntradayScope,
  MetricKey,
  NutritionLogsResult,
  PairedDevice,
  SeriesResult,
  SleepRangeResult,
  SyncActivity,
  WorkoutTrackResult,
  WorkoutsResult
} from '../shared/types'

async function invokeHealth<T>(channel: string, args: unknown[], requestId: string): Promise<T> {
  const result: unknown = await ipcRenderer.invoke(channel, ...healthWireArgs(args, requestId))
  if (isHealthCancelled(result)) throw new DOMException('The request was cancelled.', 'AbortError')
  return result as T
}

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
  chats: {
    list: (): Promise<ChatHistorySnapshot> => ipcRenderer.invoke('chats:list'),
    create: (id?: string): Promise<ChatSession> => ipcRenderer.invoke('chats:create', id),
    update: (id: string, messages: ChatSessionMessage[]): Promise<ChatSession> =>
      ipcRenderer.invoke('chats:update', id, messages),
    delete: (id: string): Promise<ChatHistorySnapshot> => ipcRenderer.invoke('chats:delete', id),
    onAccountChanged: (callback: () => void): (() => void) => {
      const listener = (): void => callback()
      ipcRenderer.on('chats:account-changed', listener)
      return () => ipcRenderer.removeListener('chats:account-changed', listener)
    }
  },
  health: {
    series: (requestId: string, metrics: MetricKey[], start: string, end: string, force?: boolean): Promise<SeriesResult> =>
      invokeHealth('health:series', [metrics, start, end, force], requestId),
    sleepRange: (requestId: string, start: string, end: string, force?: boolean): Promise<SleepRangeResult> =>
      invokeHealth('health:sleep-range', [start, end, force], requestId),
    workouts: (requestId: string, start: string, end: string, force?: boolean): Promise<WorkoutsResult> =>
      invokeHealth('health:workouts', [start, end, force], requestId),
    workoutTrack: (requestId: string, workoutId: string): Promise<WorkoutTrackResult> =>
      invokeHealth('health:workout-track', [workoutId], requestId),
    intraday: (requestId: string, date: string, scope: IntradayScope, force?: boolean): Promise<IntradaySnapshot> =>
      invokeHealth('health:intraday', [date, scope, force], requestId),
    activityIntraday: (
      requestId: string,
      date: string,
      metric: ActivityIntradayMetric,
      force?: boolean
    ): Promise<ActivityIntradayResult> =>
      invokeHealth('health:activity-intraday', [date, metric, force], requestId),
    heartDetail: (
      requestId: string,
      date: string,
      metric: HeartDetailMetric,
      scope: HeartDetailScope,
      force?: boolean
    ): Promise<HeartDetailResult> => invokeHealth('health:heart-detail', [date, metric, scope, force], requestId),
    nutritionLogs: (requestId: string, date: string): Promise<NutritionLogsResult> =>
      invokeHealth('health:nutrition-logs', [date], requestId),
    bodyMeasurements: (requestId: string, start: string, end: string): Promise<BodyMeasurementsResult> =>
      invokeHealth('health:body-measurements', [start, end], requestId),
    devices: (requestId: string, force?: boolean): Promise<PairedDevice[]> =>
      invokeHealth('health:devices', [force], requestId),
    cancel: (requestId: string): Promise<void> => ipcRenderer.invoke('health:cancel', requestId),
    refresh: (): Promise<void> => ipcRenderer.invoke('health:refresh'),
    onActivity: (callback: (activity: SyncActivity) => void): (() => void) => {
      const listener = (_: unknown, activity: SyncActivity): void => callback(activity)
      ipcRenderer.on('health:activity', listener)
      return () => ipcRenderer.removeListener('health:activity', listener)
    }
  },
  ai: {
    send: (chatId: string, runId: string, history: ChatMessage[]): Promise<void> =>
      ipcRenderer.invoke('ai:send', chatId, runId, history),
    cancel: (chatId: string, runId: string): Promise<void> =>
      ipcRenderer.invoke('ai:cancel', chatId, runId),
    onEvent: (callback: (event: AiEvent) => void): (() => void) => {
      const listener = (_: unknown, event: AiEvent): void => callback(event)
      ipcRenderer.on('ai:event', listener)
      return () => ipcRenderer.removeListener('ai:event', listener)
    }
  }
}

export type PulseApi = typeof api

contextBridge.exposeInMainWorld('pulse', api)
