import { app, BrowserWindow, session, shell } from 'electron'
import { join } from 'node:path'
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

function createWindow(target: RendererTarget): void {
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

  win.on('ready-to-show', () => win.show())

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

  void win.loadURL(target.url.toString())
}

app.whenReady().then(() => {
  const target = rendererTarget()
  applyContentSecurityPolicy(target)
  registerIpc()
  createWindow(target)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(target)
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
