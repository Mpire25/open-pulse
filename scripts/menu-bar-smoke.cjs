// Run after bun run build:
// bunx electron scripts/menu-bar-smoke.cjs
// Uses only generated fixture data in a temporary profile; never signs in.
const electron = require('electron')
const { app, BrowserWindow, ipcMain } = electron
const { mkdtempSync, writeFileSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
const { pathToFileURL } = require('node:url')
const assert = require('node:assert/strict')
const profile = mkdtempSync(join(tmpdir(), 'openpulse-menu-smoke-'))
app.setPath('userData', profile)
app.setPath('sessionData', profile)
let tray
const blurHandlers = new Map()
app.on('browser-window-created', (_event, win) => {
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
const today = new Date().toLocaleDateString('en-CA')
const offset = (date, days) => { const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() + days); return d.toLocaleDateString('en-CA') }
let screenshotPath = resolve('out/menu-bar-preview.png')
let exitCode = 0
const errors = []
app.on('web-contents-created', (_event, contents) => {
  contents.on('console-message', (details) => { if (details.level === 'error') { errors.push(details.message); console.error('Renderer error:', details.message) } })
})
const deadline = setTimeout(() => { console.error('Smoke test exceeded 45 seconds'); app.exit(1) }, 45000)

;(async () => {
  await app.whenReady()
  await import(pathToFileURL(resolve('out/main/index.js')).href)
  const goals = { steps: 10000, caloriesOut: 2800, caloriesIn: 1800, sleepMinutes: 480, activeZoneMinutes: 30, proteinG: 120, carbsG: 200, fatG: 60 }
  replace('settings:get', () => ({ goals, googleClientId: '', googleClientSecret: '', googleClientSecretConfigured: false, assistant: { model: 'gpt-6-astra', reasoningEffort: 'medium' }, chatRetention: 'forever' }))
  replace('google:status', (event) => ({ connected: event.sender.getURL().endsWith('#menu-bar') && connected }))
  replace('codex:status', () => ({ connected: false }))
  replace('chats:list', () => ({ sessions: [], persistence: 'memory' }))
  replace('health:series', (_e, metrics, start, end) => {
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
  replace('health:sleep-range', () => ({ source: 'fixture', days: missing ? [] : [{ date: today, mainSessionId: 'night', complete: true, minutesAsleep: 367, sessions: [{ id: 'night', date: today, minutesAsleep: 367, stageMinutes: { AWAKE: 22, REM: 82, LIGHT: 220, DEEP: 65 }, stages: [] }] }] }))
  replace('health:devices', () => missing ? [] : [{ name: 'Fitbit Air', batteryPct: 76, lastSync: new Date(Date.now() - 12 * 60000).toISOString() }])
  replace('health:refresh', () => { refreshed++ })
  replace('health:intraday', () => ({ date: today, heartRate: [], stepsHourly: [], currentHeartRate: null }))
  replace('health:workouts', () => ({ workouts: [], source: 'fixture' }))
  const main = BrowserWindow.getAllWindows()[0]
  await until(() => !main.webContents.isLoadingMainFrame(), 'main load')
  // Close the main window first to exercise native reopen and pending navigation.
  main.close()
  const openPanel = async () => {
    tray.emit('click')
    let panel
    await until(() => { panel = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('#menu-bar')); return !!panel }, 'panel created')
    await until(() => panel.isVisible() && !panel.webContents.isLoadingMainFrame(), 'panel ready')
    await until(async () => !panel.isDestroyed() && await panel.webContents.executeJavaScript("document.querySelector('.menu-rings, .menu-connect') !== null"), 'panel content')
    return panel
  }
  let panel = await openPanel()
  await until(() => panel.webContents.executeJavaScript("document.body.innerText.includes('12,145') && document.body.innerText.includes('Fitbit Air')"), 'fixture values')
  await delay(1800)
  const dimensions = await panel.webContents.executeJavaScript("({ width: innerWidth, height: innerHeight, scroll: document.querySelector('.menu-dashboard').scrollHeight })")
  assert.equal(dimensions.width, 452)
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
  console.log('PASS: panel reopens')
  connected = false
  panel.webContents.send('chats:account-changed')
  await until(() => panel.webContents.executeJavaScript("document.body.innerText.includes('Connect your Fitbit account') && !document.body.innerText.includes('12,145')"), 'account disconnect clears metrics')
  console.log('PASS: disconnect clears data')
  connected = true
  missing = true
  panel.webContents.send('chats:account-changed')
  await until(() => panel.webContents.executeJavaScript("document.body.innerText.includes('No steps recorded this week') && document.body.innerText.includes('Sleep stages unavailable')"), 'missing data')
  console.log('PASS: missing data')
  panel.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
  await until(() => panel.isDestroyed(), 'Escape dismisses panel')
  console.log('PASS: Escape')
  missing = false
  unavailable = true
  panel = await openPanel()
  console.log('Opened error fixture')
  await until(() => panel.webContents.executeJavaScript("document.body.innerText.includes('Some data could not be updated')"), 'partial failure feedback')
  blurHandlers.get(panel.id)()
  await until(() => panel.isDestroyed(), 'blur dismisses panel')
  assert.deepEqual(errors, [], 'renderer console errors')
  console.log(JSON.stringify({ result: 'PASS', screenshot: screenshotPath, checks: ['panel fits', 'fixture charts', 'refresh', 'closed main window weekly navigation', 'account change clears data', 'missing data', 'Escape', 'partial error', 'blur dismissal'] }))
})().catch(error => { exitCode = 1; console.error(error) }).finally(() => {
  clearTimeout(deadline)
  for (const win of BrowserWindow.getAllWindows()) win.destroy()
  tray?.destroy()
  app.exit(exitCode)
})
app.on('quit', () => { rmSync(profile, { recursive: true, force: true }) })
