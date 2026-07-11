import { ipcMain } from 'electron'
import type { IpcMainInvokeEvent, WebContents } from 'electron'
import type {
  ActivityIntradayMetric,
  AppSettings,
  ChatMessage,
  HeartDetailMetric,
  HeartDetailScope,
  IntradayScope,
  MetricKey
} from '../shared/types'
import { HEALTH_CANCELLED, splitHealthWireArgs } from '../shared/health-ipc'
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
    const prefix = `${webContents.id}:`
    for (const [key, controller] of healthControllers) {
      if (!key.startsWith(prefix)) continue
      controller.abort()
      healthControllers.delete(key)
    }
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

const healthControllers = new Map<string, AbortController>()
let legacyHealthRequestSequence = 0

function abortAllHealthRequests(): void {
  for (const controller of healthControllers.values()) controller.abort()
  healthControllers.clear()
}

function healthRequestKey(event: IpcMainInvokeEvent, requestId: string): string {
  return `${event.sender.id}:${requestId}`
}

function healthHandle<Args extends unknown[], Result>(
  channel: string,
  listener: (event: IpcMainInvokeEvent, signal: AbortSignal, ...args: Args) => Result
): void {
  handle(channel, (event, ...wireArgs: unknown[]) => {
    const split = splitHealthWireArgs(wireArgs)
    const requestId = split.requestId ?? `legacy-${Date.now()}-${legacyHealthRequestSequence++}`
    const args = split.args as Args
    const key = healthRequestKey(event, requestId)
    const previous = healthControllers.get(key)
    previous?.abort()
    const controller = new AbortController()
    healthControllers.set(key, controller)
    return Promise.resolve(listener(event, controller.signal, ...args))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return HEALTH_CANCELLED
        throw error
      })
      .finally(() => {
        if (healthControllers.get(key) === controller) healthControllers.delete(key)
      })
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
    abortAllHealthRequests()
    resetHealthAccount()
    const status = await connectGoogle()
    resetHealthAccount()
    return status
  })
  handle('google:disconnect', () => {
    abortAllHealthRequests()
    disconnectGoogle()
    resetHealthAccount()
  })

  handle('codex:status', () => getCodexStatus())
  handle('codex:connect', () => connectCodex())
  handle('codex:disconnect', () => disconnectCodex())

  handle('health:cancel', (event, requestId: string) => {
    healthControllers.get(healthRequestKey(event, requestId))?.abort()
  })
  healthHandle('health:series', (_e, signal, metrics: MetricKey[], start: string, end: string, force?: boolean) =>
    getSeries(metrics, start, end, force, signal)
  )
  healthHandle('health:sleep-range', (_e, signal, start: string, end: string, force?: boolean) =>
    getSleepRange(start, end, force, signal)
  )
  healthHandle('health:workouts', (_e, signal, start: string, end: string, force?: boolean) =>
    getWorkoutsRange(start, end, force, signal)
  )
  healthHandle('health:workout-track', (_e, signal, workoutId: string) => getWorkoutTrack(workoutId, signal))
  healthHandle('health:intraday', (_e, signal, date: string, scopeOrForce?: IntradayScope | boolean, force?: boolean) => {
    const scope = typeof scopeOrForce === 'string' ? scopeOrForce : 'both'
    if (!['steps', 'heart', 'both'].includes(scope)) throw new Error('Unsupported intraday scope')
    return getIntraday(date, typeof scopeOrForce === 'boolean' ? scopeOrForce : force, signal, scope)
  })
  healthHandle(
    'health:activity-intraday',
    (_e, signal, date: string, metric: ActivityIntradayMetric, force?: boolean) => {
      if (!isActivityIntradayMetric(metric)) throw new Error('Unsupported intraday activity metric')
      return getActivityIntraday(date, metric, force, signal)
    }
  )
  healthHandle('health:heart-detail', (_e, signal, date: string, metric: HeartDetailMetric, scopeOrForce?: HeartDetailScope | boolean, force?: boolean) => {
    if (!isHeartDetailMetric(metric)) throw new Error('Unsupported heart detail metric')
    const scope = typeof scopeOrForce === 'string' ? scopeOrForce : 'full'
    if (!['thresholds', 'full'].includes(scope)) throw new Error('Unsupported heart detail scope')
    return getHeartDetail(date, metric, typeof scopeOrForce === 'boolean' ? scopeOrForce : force, signal, scope)
  })
  healthHandle('health:nutrition-logs', (_e, signal, date: string) => getNutritionLogs(date, signal))
  healthHandle('health:body-measurements', (_e, signal, start: string, end: string) =>
    getBodyMeasurements(start, end, signal)
  )
  healthHandle('health:devices', (_e, signal, force?: boolean) => getDevices(force, signal))
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
