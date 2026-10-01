import { app, BrowserWindow, Menu, nativeImage, screen, session, shell, Tray } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import { menuBarBounds, type MenuBarDestination } from '../shared/menu-bar'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import menuBarIcon from '../../build/menu-barTemplate.png?asset'
import menuBarIconRetina from '../../build/menu-barTemplate@2x.png?asset'
import { registerIpc, registerTrustedRenderer } from './ipc'
import { createRendererTarget, safeExternalUrl, type RendererTarget } from './renderer-security'

const PRODUCTION_CSP =
  "default-src 'self'; base-uri 'none'; object-src 'none'; frame-src 'none'; form-action 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'"

function rendererTarget(): RendererTarget {
  return createRendererTarget({
    isPackaged: app.isPackaged,
    developmentUrl: process.env.ELECTRON_RENDERER_URL,
    bundledRendererPath: join(import.meta.dirname, '../renderer/index.html')
  })
}

function openExternalUrl(url: string): void {
  const safeUrl = safeExternalUrl(url)
  if (!safeUrl) return
  void shell.openExternal(safeUrl).catch((error: unknown) => {
    console.error('Failed to open external URL', error)
  })
}

// Lock the bundled renderer down in production. Development still needs Vite's
// inline HMR preamble and websocket connection.
function applyContentSecurityPolicy(target: RendererTarget): void {
  if (target.isDevelopment) return

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...details.responseHeaders }
    for (const header of Object.keys(responseHeaders)) {
      if (header.toLowerCase() === 'content-security-policy') delete responseHeaders[header]
    }

    callback({
      responseHeaders: {
        ...responseHeaders,
        'Content-Security-Policy': [PRODUCTION_CSP]
      }
    })
  })
}

let mainWindow: BrowserWindow | null = null
let menuPanel: BrowserWindow | null = null
let tray: Tray | null = null
let panelReady = false
let panelRequested = false
let quitting = false

function createWindow(target: RendererTarget, panel = false): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 1040,
    minHeight: 700,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 20, y: 20 },
    backgroundColor: '#00000000',
    vibrancy: 'sidebar',
    visualEffectState: 'active',
    ...(panel ? { width: 452, height: 650, minWidth: 0, minHeight: 0, frame: false, resizable: false, maximizable: false, minimizable: false, fullscreenable: false, skipTaskbar: true, alwaysOnTop: true, vibrancy: undefined, backgroundColor: '#0e0f12' } : {}),
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.mjs'),
      // electron-vite emits this preload as ESM. Electron's sandboxed preload
      // loader is CommonJS-only, so sandboxing here prevents window.pulse from
      // being installed and leaves the renderer unusable.
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  })

  registerTrustedRenderer(win.webContents, target.isExpectedUrl)

  if (!panel) {
    mainWindow = win
    win.once('closed', () => { if (mainWindow === win) mainWindow = null })
  }
  if (!panel) win.on('ready-to-show', () => win.show())

  // Any external link opens in the default browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternalUrl(url)
    return { action: 'deny' }
  })

  win.webContents.on('will-frame-navigate', (details) => {
    if (details.isMainFrame && target.isExpectedUrl(details.url)) return
    details.preventDefault()
    if (details.isMainFrame) openExternalUrl(details.url)
  })

  win.webContents.on('will-redirect', (details) => {
    if (details.isMainFrame && target.isExpectedUrl(details.url)) return
    details.preventDefault()
  })

  win.webContents.on('will-attach-webview', (event) => event.preventDefault())

  const url = new URL(target.url)
  if (panel) url.hash = 'menu-bar'
  void win.loadURL(url.toString())
  return win
}

function sendNewChatCommand(target: RendererTarget): void {
  const win =
    mainWindow ?? createWindow(target)
  const send = (): void => {
    if (!win.webContents.isDestroyed()) win.webContents.send('app:new-chat')
  }

  if (win.webContents.isLoadingMainFrame()) {
    win.webContents.once('did-finish-load', send)
  } else {
    send()
  }
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function closeMenuPanel(): void {
  panelRequested = false
  menuPanel?.hide()
}

function openDestination(target: RendererTarget, destination: MenuBarDestination): void {
  const win = mainWindow ?? createWindow(target)
  const send = (): void => {
    if (!win.isDestroyed()) win.webContents.send('app:navigate', destination)
  }
  if (win.webContents.isLoadingMainFrame()) win.webContents.once('did-finish-load', send)
  else send()
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
  closeMenuPanel()
}

function prepareMenuPanel(target: RendererTarget): BrowserWindow {
  if (menuPanel) return menuPanel
  const panel = createWindow(target, true)
  menuPanel = panel
  panelReady = false
  const sendVisibility = (): void => {
    if (!panel.isDestroyed()) panel.webContents.send('app:panel-visibility', panel.isVisible())
  }
  panel.on('show', sendVisibility)
  panel.on('hide', sendVisibility)
  panel.webContents.on('did-finish-load', sendVisibility)
  panel.once('ready-to-show', () => {
    panelReady = true
    if (panelRequested) { panel.show(); panel.focus() }
  })
  panel.on('blur', closeMenuPanel)
  panel.on('close', (event) => {
    if (!quitting) { event.preventDefault(); closeMenuPanel() }
  })
  panel.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'Escape') { event.preventDefault(); closeMenuPanel() }
  })
  // A crashed renderer cannot be reused; rebuild it on the next click.
  panel.webContents.on('render-process-gone', () => panel.destroy())
  panel.once('closed', () => {
    if (menuPanel === panel) { menuPanel = null; panelReady = false; panelRequested = false }
  })
  return panel
}

function installMenuBar(target: RendererTarget): void {
  // Use the app's heart with a transparent ECG cutout. Explicit representations
  // keep the mark sharp on both standard and Retina displays after packaging.
  const icon = nativeImage.createEmpty()
  icon.addRepresentation({ scaleFactor: 1, buffer: readFileSync(menuBarIcon) })
  icon.addRepresentation({ scaleFactor: 2, buffer: readFileSync(menuBarIconRetina) })
  icon.setTemplateImage(true)
  tray = new Tray(icon)
  tray.setToolTip('OpenPulse — today at a glance')
  tray.on('click', () => {
    if (panelRequested) { closeMenuPanel(); return }
    panelRequested = true
    const anchor = tray!.getBounds()
    const panel = prepareMenuPanel(target)
    panel.setBounds(menuBarBounds(anchor, screen.getDisplayMatching(anchor).workArea))
    if (panelReady) { panel.show(); panel.focus() }
  })
  // Preload the local UI once. Health requests remain disabled until shown.
  prepareMenuPanel(target)
  tray.on('right-click', () => tray?.popUpContextMenu(Menu.buildFromTemplate([
    { label: 'Open OpenPulse', click: () => { const win = mainWindow ?? createWindow(target); if (win.isMinimized()) win.restore(); win.show(); win.focus() } },
    { type: 'separator' }, { role: 'quit', label: 'Quit OpenPulse' }
  ])))
  app.once('before-quit', () => { quitting = true; tray?.destroy(); tray = null })
}

function installApplicationMenu(target: RendererTarget): void {
  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin'
      ? ([{ role: 'appMenu' }] satisfies MenuItemConstructorOptions[])
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'New Chat',
          accelerator: 'CmdOrCtrl+N',
          click: () => sendNewChatCommand(target)
        },
        { type: 'separator' },
        process.platform === 'darwin' ? { role: 'close' } : { role: 'quit' }
      ]
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.whenReady().then(() => {
  const target = rendererTarget()
  applyContentSecurityPolicy(target)
  registerIpc({ open: (destination) => openDestination(target, destination), close: closeMenuPanel, quit: () => app.quit() })
  installApplicationMenu(target)
  createWindow(target)
  if (process.platform === 'darwin') installMenuBar(target)
  app.on('activate', () => {
    const win = mainWindow ?? createWindow(target)
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
