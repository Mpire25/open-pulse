import { ipcMain } from 'electron'
import type { IpcMainInvokeEvent, WebContents } from 'electron'
import type { ActivityIntradayMetric, AppSettings, ChatMessage, HeartDetailMetric, MetricKey } from '../shared/types'
import { isActivityIntradayMetric, isHeartDetailMetric } from '../shared/types'
import { connectGoogle, disconnectGoogle, getGoogleStatus } from './google-auth'
import { connectCodex, disconnectCodex, getCodexStatus } from './codex-auth'
import {
  clearHealthCache,
  getActivityIntraday,
  getBodyMeasurements,
  getDevices,
  getHeartDetail,
  getIntraday,
  getNutritionLogs,
  getSeries,
  getSleepRange,
  getWorkoutTrack,
  getWorkoutsRange,
  resetHealthAccount
} from './health-service'
import { setApiActivityListener } from './health-api'
import { getSettings, updateSettings } from './store'
import { runChat } from './codex-chat'

interface TrustedRenderer {
  webContents: WebContents
  isExpectedUrl: (url: string) => boolean
}

const trustedRenderers = new Map<number, TrustedRenderer>()

export function registerTrustedRenderer(
  webContents: WebContents,
  isExpectedUrl: (url: string) => boolean
): void {
  const renderer = { webContents, isExpectedUrl }
  trustedRenderers.set(webContents.id, renderer)
  webContents.once('destroyed', () => {
    if (trustedRenderers.get(webContents.id) === renderer) trustedRenderers.delete(webContents.id)
  })
}

function isTrustedRenderer(event: IpcMainInvokeEvent): boolean {
  const renderer = trustedRenderers.get(event.sender.id)
  if (!renderer || renderer.webContents !== event.sender || event.sender.isDestroyed()) return false

  const senderFrame = event.senderFrame
  return (
    senderFrame !== null &&
    senderFrame.frameTreeNodeId === event.sender.mainFrame.frameTreeNodeId &&
    renderer.isExpectedUrl(senderFrame.url)
  )
}

function handle<Args extends unknown[], Result>(
  channel: string,
  listener: (event: IpcMainInvokeEvent, ...args: Args) => Result
): void {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isTrustedRenderer(event)) throw new Error('Unauthorized IPC sender')
    return listener(event, ...(args as Args))
  })
}

function sendToTrustedRenderers(channel: string, ...args: unknown[]): void {
  for (const renderer of trustedRenderers.values()) {
    const { webContents, isExpectedUrl } = renderer
    if (!webContents.isDestroyed() && isExpectedUrl(webContents.getURL())) {
      webContents.send(channel, ...args)
    }
  }
}

export function registerIpc(): void {
  handle('settings:get', () => getSettings())
  handle('settings:update', (_e, patch: Partial<AppSettings>) => updateSettings(patch))

  handle('google:status', () => getGoogleStatus())
  handle('google:connect', async () => {
    // Wipe the previous account before new credentials can be persisted, then
    // rotate again so any work started while OAuth was open is also stale.
    resetHealthAccount()
    const status = await connectGoogle()
    resetHealthAccount()
    return status
  })
  handle('google:disconnect', () => {
    disconnectGoogle()
    resetHealthAccount()
  })

  handle('codex:status', () => getCodexStatus())
  handle('codex:connect', () => connectCodex())
  handle('codex:disconnect', () => disconnectCodex())

  handle('health:series', (_e, metrics: MetricKey[], start: string, end: string, force?: boolean) =>
    getSeries(metrics, start, end, force)
  )
  handle('health:sleep-range', (_e, start: string, end: string, force?: boolean) =>
    getSleepRange(start, end, force)
  )
  handle('health:workouts', (_e, start: string, end: string, force?: boolean) =>
    getWorkoutsRange(start, end, force)
  )
  handle('health:workout-track', (_e, workoutId: string) => getWorkoutTrack(workoutId))
  handle('health:intraday', (_e, date: string, force?: boolean) => getIntraday(date, force))
  handle(
    'health:activity-intraday',
    (_e, date: string, metric: ActivityIntradayMetric, force?: boolean) => {
      if (!isActivityIntradayMetric(metric)) throw new Error('Unsupported intraday activity metric')
      return getActivityIntraday(date, metric, force)
    }
  )
  handle('health:heart-detail', (_e, date: string, metric: HeartDetailMetric, force?: boolean) => {
    if (!isHeartDetailMetric(metric)) throw new Error('Unsupported heart detail metric')
    return getHeartDetail(date, metric, force)
  })
  handle('health:nutrition-logs', (_e, date: string) => getNutritionLogs(date))
  handle('health:body-measurements', (_e, start: string, end: string) => getBodyMeasurements(start, end))
  handle('health:devices', (_e, force?: boolean) => getDevices(force))
  handle('health:refresh', () => clearHealthCache())

  // Live "requests in flight" counter for the topbar sync indicator.
  setApiActivityListener((pending) => {
    sendToTrustedRenderers('health:activity', { pending })
  })

  handle('ai:send', (event, chatId: string, history: ChatMessage[]) => {
    // Fire and forget: progress streams back over 'ai:event'.
    void runChat(event.sender, chatId, history)
  })
}
