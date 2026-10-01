// Run after bun run build:
// bunx electron scripts/menu-bar-smoke.cjs [--memory] [--entry /path/to/out/main/index.js]
// Uses generated fixture data in a temporary profile, without showing/focusing windows or signing in.
const electron = require('electron')
const { app, BrowserWindow, ipcMain, screen } = electron
const { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
const { pathToFileURL } = require('node:url')
const { execFileSync } = require('node:child_process')
const measureMemory = process.argv.includes('--memory')
const entryFlag = process.argv.indexOf('--entry')
const appEntry = entryFlag >= 0 ? process.argv[entryFlag + 1] : resolve('out/main/index.js')
const assert = require('node:assert/strict')
const profile = mkdtempSync(join(tmpdir(), 'openpulse-menu-smoke-'))
app.setPath('userData', profile)
app.setPath('sessionData', profile)
const startDisabled = process.argv.includes('--menu-disabled')
const storePath = join(profile, 'pulse-store.json')
if (startDisabled) writeFileSync(storePath, JSON.stringify({ settings: { menuBarEnabled: false }, secrets: {} }))
const savedMenuBarEnabled = () => existsSync(storePath) ? JSON.parse(readFileSync(storePath, 'utf8')).settings.menuBarEnabled ?? true : true
let tray
const visibilityTrace = []
const blurHandlers = new Map()
app.on('browser-window-created', (_event, win) => {
  // Simulate visibility without showing windows or taking desktop focus.
  // This still loads and renders the real Electron windows and their preload.
  let visible = false
  win.show = () => { visibilityTrace.push(['show', win.id]); visible = true; win.emit('show') }
  win.hide = () => { visibilityTrace.push(['hide', win.id]); visible = false; win.emit('hide') }
  win.isVisible = () => visible
  win.focus = () => {}
  // Keep unrelated desktop focus changes from interrupting this automated run.
  // The real registered dismissal handler is exercised explicitly below.
  const on = win.on
  win.on = function (event, listener) {
    if (event === 'blur') { blurHandlers.set(win.id, listener); return this }
    return on.call(this, event, listener)
  }
})
const OriginalTray = electron.Tray
// Record the real native tray, so the test can exercise its click handler.
const originalOn = OriginalTray.prototype.on
OriginalTray.prototype.on = function (...args) { tray = this; return originalOn.apply(this, args) }
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function until(check, label) {
  for (let i = 0; i < 100; i++) {
    let timeout
    try {
      if (await Promise.race([check(), new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error(`Unresponsive check: ${label}`)), 3000) })])) return
    } finally { clearTimeout(timeout) }
    await delay(50)
  }
  throw new Error(`Timed out: ${label}`)
}
function replace(channel, handler) { ipcMain.removeHandler(channel); ipcMain.handle(channel, handler) }
let connected = true
let missing = false
let unavailable = false
let refreshed = 0
let healthRequests = 0
const today = new Date().toLocaleDateString('en-CA')
const offset = (date, days) => { const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() + days); return d.toLocaleDateString('en-CA') }
let screenshotPath = resolve('out/menu-bar-preview.png')
let exitCode = 0
const errors = []
app.on('web-contents-created', (_event, contents) => {
  contents.on('console-message', (details) => { if (details.level === 'error') { errors.push(details.message); console.error('Renderer error:', details.message) } })
})
const deadline = setTimeout(() => { console.error('Test exceeded its time limit'); app.exit(1) }, measureMemory ? 120000 : 45000)

async function memoryRun(main, openPanel) {
  const stages = []
  async function sample(label) {
    await delay(2000)
    const metrics = app.getAppMetrics()
    const panel = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('#menu-bar'))
    const rows = metrics.map(m => {
      let footprintMiB = null
      try {
        const summary = execFileSync('/usr/bin/vmmap', ['-summary', String(m.pid)], { encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'ignore'] })
        const match = summary.match(/Physical footprint:\s+([\d.]+)([KMG])/)
        if (match) footprintMiB = Number(match[1]) * ({ K: 1 / 1024, M: 1, G: 1024 }[match[2]])
      } catch { /* RSS remains available if macOS refuses process inspection. */ }
      return { pid: m.pid, type: m.type, panel: m.pid === panel?.webContents.getOSProcessId(), rssMiB: m.memory.workingSetSize / 1024, footprintMiB }
    })
    const result = { label, healthRequests, processes: rows, totalRssMiB: rows.reduce((sum, r) => sum + r.rssMiB, 0), totalFootprintMiB: rows.every(r => r.footprintMiB !== null) ? rows.reduce((sum, r) => sum + r.footprintMiB, 0) : null }
    stages.push(result)
    console.log('MEMORY', JSON.stringify(result))
  }
  await sample('startup-main-open')
  const start = performance.now()
  let panel = await openPanel()
  const firstOpenMs = performance.now() - start
  await until(() => panel.webContents.executeJavaScript("document.body.innerText.includes('12,145') && document.querySelector('[role=\"meter\"]')?.getAttribute('aria-valuenow') === '76'"), 'memory fixture ready')
  await sample('panel-open')
  blurHandlers.get(panel.id)()
  await sample('panel-dismissed-main-open')
  const reopenMs = []
  const retainedAfterDismissal = !panel.isDestroyed()
  for (let i = 0; retainedAfterDismissal && i < 25; i++) {
    const before = performance.now()
    panel = await openPanel()
    await until(() => panel.webContents.executeJavaScript("document.body.innerText.includes('12,145')"), 'warm data')
    reopenMs.push(performance.now() - before)
    blurHandlers.get(panel.id)()
    if (i === 4) await sample('after-five-reopens')
  }
  if (retainedAfterDismissal) await sample('after-25-reopens')
  main.close()
  await until(() => main.isDestroyed(), 'main actually closed')
  await sample('main-closed-panel-dismissed')
  const retained = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('#menu-bar'))
  retained?.destroy()
  assert.equal(BrowserWindow.getAllWindows().length, 0, 'memory baseline must have no windows')
  await sample('all-windows-destroyed')
  const report = { entry: appEntry, firstOpenMs, reopenMs, retainedAfterDismissal, stages }
  const path = resolve(process.env.OPENPULSE_MEMORY_REPORT || 'out/menu-bar-memory.json')
  writeFileSync(path, JSON.stringify(report, null, 2))
  console.log('MEMORY_REPORT', path)
}

;(async () => {
  await app.whenReady()
  app.setActivationPolicy('prohibited')
  await import(pathToFileURL(resolve(appEntry)).href)
  const goals = { steps: 10000, caloriesOut: 2800, caloriesIn: 1800, sleepMinutes: 480, activeZoneMinutes: 30, proteinG: 120, carbsG: 200, fatG: 60 }
  replace('settings:get', () => ({ menuBarEnabled: savedMenuBarEnabled(), goals, googleClientId: '', googleClientSecret: '', googleClientSecretConfigured: false, assistant: { model: 'gpt-6-astra', reasoningEffort: 'medium' }, chatRetention: 'forever' }))
  replace('google:status', (event) => ({ connected: event.sender.getURL().endsWith('#menu-bar') && connected }))
  replace('codex:status', () => ({ connected: false }))
  replace('chats:list', () => ({ sessions: [], persistence: 'memory' }))
  replace('health:series', (_e, metrics, start, end) => {
    healthRequests++
    if (unavailable) return { healthRequestError: true, message: 'Fixture network unavailable' }
    const days = {}
    for (let date = start; date <= end; date = offset(date, 1)) {
      days[date] = {}
      if (missing) continue
      for (const metric of metrics) {
        const values = { steps: date === today ? 12145 : 6000 + Number(date.slice(-2)) * 137, caloriesOut: 2339, caloriesIn: 1463, restingHeartRate: date === today ? 71 : 66, weightKg: date === today ? 78.5 : 78.8 }
        days[date][metric] = values[metric]
      }
    }
    return { source: 'fixture', start, end, days }
  })
  replace('health:sleep-range', () => (healthRequests++, { source: 'fixture', days: missing ? [] : [{ date: today, mainSessionId: 'night', complete: true, minutesAsleep: 367, sessions: [{ id: 'night', date: today, minutesAsleep: 367, stageMinutes: { AWAKE: 22, REM: 82, LIGHT: 220, DEEP: 65 }, stages: [] }] }] }))
  replace('health:devices', () => (healthRequests++, missing ? [] : [{ name: 'Fitbit Air', batteryPct: 76, lastSync: new Date(Date.now() - 12 * 60000).toISOString() }]))
  replace('health:refresh', () => { refreshed++ })
  replace('health:intraday', () => ({ date: today, heartRate: [], stepsHourly: [], currentHeartRate: null }))
  replace('health:workouts', () => ({ workouts: [], source: 'fixture' }))
  await until(() => BrowserWindow.getAllWindows().every(w => w.webContents.getURL() && !w.webContents.isLoadingMainFrame()), 'initial windows loaded')
  const main = BrowserWindow.getAllWindows().find(w => !w.webContents.getURL().endsWith('#menu-bar'))
  await until(() => !main.webContents.isLoadingMainFrame(), 'main load')
  if (startDisabled) {
    assert.equal(tray, undefined, 'disabled startup must not create a tray')
    assert.equal(BrowserWindow.getAllWindows().length, 1, 'disabled startup must not preload a panel')
    await main.webContents.executeJavaScript('window.pulse.settings.update({ menuBarEnabled: true })')
    await until(() => !!tray, 'enable after disabled startup')
    console.log('PASS: persisted disabled preference at startup')
  }
  if (!measureMemory) assert.equal(healthRequests, 0, 'preloading must not fetch health data')
  // Close the main window first to exercise native reopen and pending navigation.
  if (!measureMemory) { main.close(); await until(() => main.isDestroyed(), 'main closed') }
  const openPanel = async () => {
    tray.emit('click')
    let panel
    await until(() => { panel = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('#menu-bar')); return !!panel }, 'panel created')
    await until(() => panel.isVisible() && !panel.webContents.isLoadingMainFrame(), 'panel ready').catch(error => { console.error(JSON.stringify({ panel: panel.id, visible: panel.isVisible(), loading: panel.webContents.isLoadingMainFrame(), trace: visibilityTrace.slice(-20) })); throw error })
    await until(async () => !panel.isDestroyed() && await panel.webContents.executeJavaScript("document.querySelector('.menu-rings, .menu-connect') !== null"), 'panel content')
    return panel
  }
  if (measureMemory) { await memoryRun(main, openPanel); return }
  let panel = await openPanel()
  const initialPanelId = panel.id
  assert.equal(tray.getIgnoreDoubleClickEvents(), true, 'Rapid clicks must use the same toggle')
  const originalCursorPoint = screen.getCursorScreenPoint
  const trayBounds = tray.getBounds()
  try {
    screen.getCursorScreenPoint = () => ({ x: trayBounds.x + trayBounds.width / 2, y: trayBounds.y + trayBounds.height / 2 })
    const traceStart = visibilityTrace.length
    blurHandlers.get(panel.id)()
    tray.emit('click')
    assert.equal(panel.isVisible(), false, 'Second tray press closes even when blur precedes click')
    tray.emit('click')
    assert.equal(panel.isVisible(), true, 'Next press opens the panel')
    tray.emit('click')
    assert.equal(panel.isVisible(), false, 'Rapid second press closes the panel')
    assert.ok(visibilityTrace.slice(traceStart).every(([, id]) => id === panel.id), 'Tray toggles must not show the main window')
    screen.getCursorScreenPoint = () => ({ x: trayBounds.x - 100, y: trayBounds.y + 100 })
    tray.emit('click')
    blurHandlers.get(panel.id)()
    assert.equal(panel.isVisible(), false, 'Clicking away still dismisses the panel')
  } finally {
    screen.getCursorScreenPoint = originalCursorPoint
  }
  panel = await openPanel()
  console.log('PASS: repeated tray clicks only toggle the popup')
  await until(() => panel.webContents.executeJavaScript("document.body.innerText.includes('12,145') && document.querySelector('[role=\"meter\"]')?.getAttribute('aria-valuenow') === '76'"), 'fixture values')
  await delay(1800)
  const dimensions = await panel.webContents.executeJavaScript("({ width: innerWidth, height: innerHeight, scroll: document.querySelector('.menu-dashboard').scrollHeight })")
  assert.equal(dimensions.width, 452)
  const footerLayout = await panel.webContents.executeJavaScript(`(() => {
    const footer = document.querySelector('.menu-footer').getBoundingClientRect()
    const quit = document.querySelector('.menu-quit').getBoundingClientRect()
    const text = document.querySelector('.menu-footer-text').getBoundingClientRect()
    return { bottomGap: innerHeight - footer.bottom, sameRow: quit.left >= text.right && quit.top < text.bottom && quit.bottom <= footer.bottom }
  })()`)
  assert.ok(footerLayout.bottomGap >= 0 && footerLayout.bottomGap <= 14, JSON.stringify(footerLayout))
  assert.ok(footerLayout.sameRow, 'Quit shares the footer row with sync information')
  writeFileSync(screenshotPath, (await panel.webContents.capturePage()).toPNG())
  console.log('PASS: panel renders and fits')
  assert.ok(dimensions.scroll <= dimensions.height, `Panel overflow: ${JSON.stringify(dimensions)}`)
  await panel.webContents.executeJavaScript("document.querySelector('[aria-label=\"Refresh health data\"]').click()")
  await until(() => refreshed === 1, 'manual refresh')
  console.log('PASS: refresh')
  void panel.webContents.executeJavaScript("document.querySelector('.menu-section-title').click()").catch(() => {})
  console.log('Opening weekly chart')
  let reopened
  await until(() => { reopened = BrowserWindow.getAllWindows().find(w => !w.webContents.getURL().endsWith('#menu-bar')); return !!reopened }, 'main recreated')
  await until(() => reopened.webContents.executeJavaScript("window.history.state?.detailMetric?.metric === 'steps' && window.history.state?.detailMetric?.range === 'W'"), 'queued weekly destination')
  console.log('PASS: weekly chart navigation')
  assert.equal(await reopened.webContents.executeJavaScript('window.history.state.selectedDate'), today)
  reopened.close()
  panel = await openPanel()
  await until(() => panel.webContents.executeJavaScript("document.body.innerText.includes('12,145')"), 'panel after reopening')
  assert.equal(panel.id, initialPanelId, 'reopening must reuse the existing renderer')
  console.log('PASS: panel reopens without rebuilding')
  connected = false
  panel.webContents.send('chats:account-changed')
  await until(() => panel.webContents.executeJavaScript("document.body.innerText.includes('Connect your Fitbit account') && !document.body.innerText.includes('12,145')"), 'account disconnect clears metrics')
  console.log('PASS: disconnect clears data')
  connected = true
  missing = true
  panel.webContents.send('chats:account-changed')
  await until(() => panel.webContents.executeJavaScript("document.body.innerText.includes('No steps recorded this week') && document.body.innerText.includes('Sleep stages unavailable')"), 'missing data')
  console.log('PASS: missing data')
  panel.webContents.emit('before-input-event', { preventDefault() {} }, { key: 'Escape' })
  await until(() => !panel.isVisible(), 'Escape hides panel')
  assert.equal(panel.isDestroyed(), false)
  console.log('PASS: Escape')
  missing = false
  unavailable = true
  panel = await openPanel()
  panel.webContents.send('chats:account-changed')
  console.log('Opened error fixture')
  await until(() => panel.webContents.executeJavaScript("document.body.innerText.includes('Some data could not be updated')"), 'partial failure feedback')
  blurHandlers.get(panel.id)()
  await until(() => !panel.isVisible(), 'blur hides panel')
  assert.equal(panel.isDestroyed(), false)
  const hiddenRequests = healthRequests
  await delay(1100)
  assert.equal(healthRequests, hiddenRequests, 'hidden panel must not start new health requests')
  panel.close()
  assert.equal(panel.isDestroyed(), false, 'window close also preserves the panel')
  await panel.webContents.executeJavaScript(`window.pulse.app.open({ view: 'settings', date: '${today}' })`)
  let settingsWindow
  await until(() => { settingsWindow = BrowserWindow.getAllWindows().find(w => w.webContents.getURL() && !w.webContents.getURL().endsWith('#menu-bar')); return !!settingsWindow }, 'settings window')
  await until(() => settingsWindow.webContents.executeJavaScript("document.querySelector('#menu-bar-enabled')?.getAttribute('aria-checked') === 'true'"), 'menu bar setting')
  await delay(600)
  const headingBounds = await settingsWindow.webContents.executeJavaScript(`(() => {
    const heading = Array.from(document.querySelectorAll('h3')).find(node => node.textContent === 'macOS menu bar')
    const rect = heading.getBoundingClientRect()
    return { x: Math.floor(rect.x - 40), y: Math.floor(rect.y - 16), width: 360, height: 60 }
  })()`)
  writeFileSync(resolve('out/menu-bar-setting-preview.png'), (await settingsWindow.webContents.capturePage(headingBounds)).toPNG())
  const activeTray = tray
  await settingsWindow.webContents.executeJavaScript("document.querySelector('#menu-bar-enabled').click()")
  await until(() => activeTray.isDestroyed() && panel.isDestroyed(), 'disable removes tray and retained panel')
  assert.equal(savedMenuBarEnabled(), false, 'disabled preference persisted')
  await until(() => settingsWindow.webContents.executeJavaScript("document.querySelector('#menu-bar-enabled')?.getAttribute('aria-checked') === 'false' && !document.querySelector('#menu-bar-enabled').disabled"), 'toggle saved')
  await settingsWindow.webContents.executeJavaScript("document.querySelector('#menu-bar-enabled').click()")
  await until(() => tray !== activeTray && !tray.isDestroyed(), 'enable recreates tray')
  assert.equal(savedMenuBarEnabled(), true, 'enabled preference persisted')
  panel = await openPanel()
  assert.equal(app.listenerCount('before-quit'), 1, 'toggling must not accumulate quit handlers')
  console.log('PASS: settings switch disables, persists, and re-enables the menu bar')
  assert.deepEqual(errors, [], 'renderer console errors')
  console.log(JSON.stringify({ result: 'PASS', screenshot: screenshotPath, checks: ['panel fits', 'fixture charts', 'refresh', 'closed main window weekly navigation', 'account change clears data', 'missing data', 'Escape', 'partial error', 'blur dismissal'] }))
})().catch(error => { exitCode = 1; console.error(error) }).finally(() => {
  clearTimeout(deadline)
  for (const win of BrowserWindow.getAllWindows()) win.destroy()
  if (tray && !tray.isDestroyed()) tray.destroy()
  app.exit(exitCode)
})
app.on('quit', () => { rmSync(profile, { recursive: true, force: true }) })
