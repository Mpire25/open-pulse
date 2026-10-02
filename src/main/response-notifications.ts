import { BrowserWindow, Notification, webContents } from 'electron'
import { ResponseNotificationController } from './response-notification-controller'
import { getResponseNotificationPreferences } from './store'

export function createResponseNotifications(
  openChat: (senderId: number, chatId: string) => void,
  chatTitle: (senderId: number, chatId: string) => string | undefined = () => undefined
): ResponseNotificationController {
  return new ResponseNotificationController({
    preferences: getResponseNotificationPreferences,
    chatTitle,
    isFocused: (senderId) => {
      const sender = webContents.fromId(senderId)
      const win = sender && BrowserWindow.fromWebContents(sender)
      return Boolean(win && !win.isDestroyed() && win.isVisible() && !win.isMinimized() && win.isFocused())
    },
    openChat,
    create: (options, click, finished) => {
      if (!Notification.isSupported()) return null
      const notification = new Notification(options)
      notification.once('click', click)
      notification.once('close', finished)
      notification.once('failed', () => {
        finished()
        console.warn('OpenPulse response notification could not be delivered.')
      })
      return notification
    }
  })
}
