import { ipcMain } from 'electron'
import type { AppSettings, ChatMessage } from '../shared/types'
import { connectGoogle, disconnectGoogle, getGoogleStatus } from './google-auth'
import { connectCodex, disconnectCodex, getCodexStatus } from './codex-auth'
import { getDevices, getHealthDay, getSleepHistory } from './health-service'
import { getSettings, updateSettings } from './store'
import { runChat } from './codex-chat'

export function registerIpc(): void {
  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:update', (_e, patch: Partial<AppSettings>) => updateSettings(patch))

  ipcMain.handle('google:status', () => getGoogleStatus())
  ipcMain.handle('google:connect', () => connectGoogle())
  ipcMain.handle('google:disconnect', () => disconnectGoogle())

  ipcMain.handle('codex:status', () => getCodexStatus())
  ipcMain.handle('codex:connect', () => connectCodex())
  ipcMain.handle('codex:disconnect', () => disconnectCodex())

  ipcMain.handle('health:day', (_e, date: string, force?: boolean) => getHealthDay(date, force))
  ipcMain.handle('health:sleep', (_e, nights: number, endDate?: string) => getSleepHistory(nights, endDate))
  ipcMain.handle('health:devices', () => getDevices())

  ipcMain.handle('ai:send', (event, chatId: string, history: ChatMessage[]) => {
    // Fire and forget: progress streams back over 'ai:event'.
    void runChat(event.sender, chatId, history)
  })
}
