import { BrowserWindow, ipcMain } from 'electron'
import type { AppSettings, ChatMessage, MetricKey } from '../shared/types'
import { connectGoogle, disconnectGoogle, getGoogleStatus } from './google-auth'
import { connectCodex, disconnectCodex, getCodexStatus } from './codex-auth'
import {
  clearHealthCache,
  getDevices,
  getIntraday,
  getSeries,
  getSleepRange,
  getWorkoutsRange
} from './health-service'
import { setApiActivityListener } from './health-api'
import { wipeArchive } from './metric-store'
import { getSettings, updateSettings } from './store'
import { runChat } from './codex-chat'

export function registerIpc(): void {
  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:update', (_e, patch: Partial<AppSettings>) => updateSettings(patch))

  ipcMain.handle('google:status', () => getGoogleStatus())
  ipcMain.handle('google:connect', () => connectGoogle())
  ipcMain.handle('google:disconnect', async () => {
    await disconnectGoogle()
    // The archive is this account's health data; it goes with the connection.
    wipeArchive()
  })

  ipcMain.handle('codex:status', () => getCodexStatus())
  ipcMain.handle('codex:connect', () => connectCodex())
  ipcMain.handle('codex:disconnect', () => disconnectCodex())

  ipcMain.handle('health:series', (_e, metrics: MetricKey[], start: string, end: string, force?: boolean) =>
    getSeries(metrics, start, end, force)
  )
  ipcMain.handle('health:sleep-range', (_e, start: string, end: string, force?: boolean) =>
    getSleepRange(start, end, force)
  )
  ipcMain.handle('health:workouts', (_e, start: string, end: string, force?: boolean) =>
    getWorkoutsRange(start, end, force)
  )
  ipcMain.handle('health:intraday', (_e, date: string, force?: boolean) => getIntraday(date, force))
  ipcMain.handle('health:devices', (_e, force?: boolean) => getDevices(force))
  ipcMain.handle('health:refresh', () => clearHealthCache())

  // Live "requests in flight" counter for the topbar sync indicator.
  setApiActivityListener((pending) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('health:activity', { pending })
    }
  })

  ipcMain.handle('ai:send', (event, chatId: string, history: ChatMessage[]) => {
    // Fire and forget: progress streams back over 'ai:event'.
    void runChat(event.sender, chatId, history)
  })
}
