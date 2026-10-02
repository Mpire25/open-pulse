// Run after bun run build:
// bunx electron scripts/menu-bar-smoke.cjs [--dashboard] [--memory] [--entry /path/to/out/main/index.js]
// Uses generated fixture data in a temporary profile, without showing/focusing windows or signing in.
const electron = require('electron')
const { app, BrowserWindow, ipcMain, screen } = electron
const { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
const { pathToFileURL } = require('node:url')
const { execFileSync } = require('node:child_process')
const measureMemory = process.argv.includes('--memory')
const checkDashboards = process.argv.includes('--dashboard')
let pendingPicker = null
let failNextPicker = false
// Inspect the real native Menu/IPC without displaying a menu or taking desktop focus.
if (checkDashboards) {
  electron.Menu.prototype.popup = function(options) {
    if (failNextPicker) { failNextPicker = false; throw new Error('Fixture native menu failure') }
    assert.equal(pendingPicker, null, 'one native picker at a time')
    pendingPicker = { menu: this, options }
  }
  electron.Menu.prototype.closePopup = function() {
    if (pendingPicker?.menu === this) {
      const { options } = pendingPicker
      pendingPicker = null
      options.callback?.()
    }
  }
}
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
      if (await Promise.race([check(), new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error(`Unresponsive check: ${label}`)), 10000) })])) return
    } finally { clearTimeout(timeout) }
    await delay(50)
  }
  throw new Error(`Timed out: ${label}`)
}
const fixtureRequestLog = []
const mainRequestLog = []
function replace(channel, handler) {
  ipcMain.removeHandler(channel)
  ipcMain.handle(channel, (event, ...args) => {
    if (channel.startsWith('health:')) {
      fixtureRequestLog.push({ channel, windowId: event.sender.id, visible: BrowserWindow.fromWebContents(event.sender)?.isVisible(), panel: event.sender.getURL().endsWith('#menu-bar'), time: Date.now() })
      if (!event.sender.getURL().endsWith('#menu-bar')) mainRequestLog.push(channel)
    }
    return handler(event, ...args)
  })
}
let connected = true
let mainConnected = false
let todaySteps = 12145
let panelHealthRequests = 0
let missing = false
let fixtureWorkouts = []
let failActivityIntraday = false
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
const deadline = setTimeout(() => { console.error('Test exceeded its time limit'); app.exit(1) }, measureMemory ? 120000 : 90000)

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
    panel = panel.isVisible() ? panel : await openPanel()
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
  // Retain the real trusted refresh handler and its cross-window broadcast.
  let dashboardUpdateHandler
  const originalHandle = ipcMain.handle.bind(ipcMain)
  ipcMain.handle = (channel, handler) => {
    if (channel === 'dashboard:update') dashboardUpdateHandler = handler
    return originalHandle(channel, channel === 'health:refresh'
    ? (...args) => { refreshed++; return handler(...args) } : handler)
  }
  await import(pathToFileURL(resolve(appEntry)).href)
  ipcMain.handle = originalHandle
  const goals = { steps: 10000, caloriesOut: 2800, caloriesIn: 1800, sleepMinutes: 480, activeZoneMinutes: 30, proteinG: 120, carbsG: 200, fatG: 60 }
  replace('settings:get', () => ({ menuBarEnabled: savedMenuBarEnabled(), goals, googleClientId: '', googleClientSecret: '', googleClientSecretConfigured: false, assistant: { model: 'gpt-6-astra', reasoningEffort: 'medium' }, chatRetention: 'forever' }))
  replace('google:status', (event) => ({ connected: connected && (mainConnected || event.sender.getURL().endsWith('#menu-bar')) }))
  replace('codex:status', () => ({ connected: false }))
  replace('chats:list', () => ({ sessions: [], persistence: 'memory' }))
  replace('health:series', (_e, metrics, start, end) => {
    healthRequests++
    if (_e.sender.getURL().endsWith('#menu-bar')) panelHealthRequests++
    if (unavailable) return { healthRequestError: true, message: 'Fixture network unavailable' }
    const days = {}
    for (let date = start; date <= end; date = offset(date, 1)) {
      days[date] = {}
      if (missing) continue
      for (const metric of metrics) {
        const values = { steps: date === today ? todaySteps : 6000 + Number(date.slice(-2)) * 137, caloriesOut: 2339, caloriesIn: 1463, restingHeartRate: date === today ? 71 : 66, hrvMs: date === today ? 52 : 48, weightKg: date === today ? 78.5 : 78.8, proteinG: 90, waterMl: 1500, activeZoneMinutes: 26, skinTempDeltaC: -0.3 }
        days[date][metric] = values[metric]
      }
    }
    return { source: 'fixture', start, end, days }
  })
  replace('health:sleep-range', () => (healthRequests++, { source: 'fixture', days: missing ? [] : [{ date: today, mainSessionId: 'night', complete: true, minutesAsleep: 367, efficiency: 94, sessions: [{ id: 'night', date: today, startTime: `${offset(today, -1)}T23:00:00`, endTime: `${today}T05:29:00`, minutesAsleep: 367, stageMinutes: { AWAKE: 22, REM: 82, LIGHT: 220, DEEP: 65 }, stages: [] }] }] }))
  replace('health:devices', () => (healthRequests++, missing ? [] : [{ name: 'Fitbit Air', batteryPct: 76, lastSync: new Date(Date.now() - 12 * 60000).toISOString() }]))
  replace('health:intraday', () => ({ date: today, heartRate: [{ minute: 0, bpm: 65 }, { minute: 360, bpm: 78 }, { minute: 720, bpm: 70 }], stepsHourly: [{ hour: 0, steps: 120 }, { hour: 6, steps: 550 }], currentHeartRate: null }))
  replace('health:activity-intraday', (_e, date, metric) => {
    if (failActivityIntraday) throw new Error('Fixture intraday failure')
    return { date, metric, source: 'fixture', windowMinutes: 30, points: [{ minute: 0, value: metric === 'floors' || metric === 'sedentaryMinutes' ? 3 : 20 }, { minute: 360, value: 80 }], breakdown: [] }
  })
  replace('health:workouts', () => ({ workouts: fixtureWorkouts, source: 'fixture' }))
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
    tray.emit('mouse-down')
    tray.emit('mouse-up')
    tray.emit('click')
    assert.equal(panel.isVisible(), false, 'Second tray press closes even when blur precedes mouse-down')
    tray.emit('click')
    assert.equal(panel.isVisible(), true, 'Next press opens the panel')
    tray.emit('click')
    assert.equal(panel.isVisible(), false, 'Rapid second press closes the panel')
    tray.emit('click')
    tray.emit('mouse-down')
    blurHandlers.get(panel.id)()
    await until(() => !panel.isVisible(), 'blur during held tray press')
    tray.emit('mouse-up')
    tray.emit('click')
    assert.equal(panel.isVisible(), false, 'Releasing a held press must not reopen a dismissed panel')
    tray.emit('click')
    blurHandlers.get(panel.id)()
    await until(() => !panel.isVisible(), 'keyboard blur dismisses with pointer over tray')
    assert.ok(visibilityTrace.slice(traceStart).every(([, id]) => id === panel.id), 'Tray toggles must not show the main window')
    screen.getCursorScreenPoint = () => ({ x: trayBounds.x - 100, y: trayBounds.y + 100 })
    tray.emit('click')
    blurHandlers.get(panel.id)()
    await until(() => !panel.isVisible(), 'Clicking away still dismisses the panel')
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
  await until(() => { reopened = BrowserWindow.getAllWindows().find(w => w.webContents.getURL() && !w.webContents.getURL().endsWith('#menu-bar') && !w.webContents.isLoadingMainFrame()); return !!reopened }, 'main recreated')
  await until(() => reopened.webContents.executeJavaScript("window.history.state?.detailMetric?.metric === 'steps' && window.history.state?.detailMetric?.range === 'W'"), 'queued weekly destination')
  console.log('PASS: weekly chart navigation')
  assert.equal(await reopened.webContents.executeJavaScript('window.history.state.selectedDate'), today)
  reopened.close()
  await until(() => reopened.isDestroyed(), 'main window closed')
  panel = await openPanel()
  await until(() => panel.webContents.executeJavaScript("document.body.innerText.includes('12,145')"), 'panel after reopening')
  assert.equal(panel.id, initialPanelId, 'reopening must reuse the existing renderer')
  console.log('PASS: panel reopens without rebuilding')
  assert.ok(await panel.webContents.executeJavaScript(`document.querySelector('[aria-label="Open HRV details"]').textContent.includes('52 ms')`), 'HRV value renders in milliseconds')
  await panel.webContents.executeJavaScript(`document.querySelector('[aria-label="Open HRV details"]').click()`)
  await until(() => { reopened = BrowserWindow.getAllWindows().find(w => w.webContents.getURL() && !w.webContents.getURL().endsWith('#menu-bar') && !w.webContents.isLoadingMainFrame()); return !!reopened }, 'main recreated for HRV')
  await until(() => reopened.webContents.executeJavaScript("window.history.state?.detailMetric?.metric === 'hrvMs' && window.history.state?.selectedDate === '" + today + "'"), 'dated HRV destination')
  reopened.close()
  await until(() => reopened.isDestroyed(), 'main window closed')
  panel = await openPanel()
  console.log('PASS: HRV reading and detail navigation')
  mainConnected = true
  await panel.webContents.executeJavaScript(`window.pulse.app.open({ view: 'home', date: '${today}' })`)
  await until(() => { reopened = BrowserWindow.getAllWindows().find(w => w.webContents.getURL() && !w.webContents.getURL().endsWith('#menu-bar') && !w.webContents.isLoadingMainFrame()); return !!reopened }, 'main home loaded')
  await until(() => reopened.webContents.executeJavaScript("document.body.innerText.includes('12,145')"), 'main initial reading')
  if (process.argv.includes('--geometry')) {
    const report = {}
    for (const width of [1000, 1280, 1500]) {
      reopened.setSize(width, 1100)
      await delay(600)
      const measure = () => reopened.webContents.executeJavaScript(`(() => {
        const rect = (e) => { const r = e.getBoundingClientRect(); return { width: r.width, height: r.height } }
        const hero = document.querySelector('.home-hero')
        const root = hero.parentElement.parentElement
        return {
          hero: rect(hero),
          rings: Array.from(hero.querySelectorAll('.home-goal-ring')).map(rect),
          summaries: Array.from(hero.querySelectorAll('.home-hero-stat')).map(e => ({ ...rect(e), font: getComputedStyle(e.querySelector('strong') || e.querySelector('span > span:nth-child(2)')).fontSize })),
          cards: Array.from(document.querySelector('.display-lg-pair-grid').children).map(rect),
          highlights: rect(root.children[3]),
          tiles: Array.from(root.querySelector('.display-four-grid').children).map(rect),
          workouts: rect(root.children[4])
        }
      })()`)
      report[width] = await measure()
      if (width === 1500) writeFileSync(resolve('out/dashboard-home-default-preview.png'), (await reopened.webContents.capturePage()).toPNG())
      if (checkDashboards) {
        await reopened.webContents.executeJavaScript(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Customize').click()`)
        await delay(200)
        assert.deepEqual(await measure(), report[width], 'editing preserves card, ring and summary dimensions at ' + width)
        if (width === 1500) writeFileSync(resolve('out/dashboard-edit-preview.png'), (await reopened.webContents.capturePage()).toPNG())
        await reopened.webContents.executeJavaScript(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Cancel').click()`)
      }
    }
    const referenceFlag = process.argv.indexOf('--geometry-reference')
    // Recorded from the unmodified a883643 homepage with the same Electron fixture.
    const reference = referenceFlag >= 0 ? process.argv[referenceFlag + 1] : checkDashboards ? resolve('tests/fixtures/dashboard-original-geometry.json') : null
    if (reference) assert.deepEqual(report, JSON.parse(readFileSync(reference, 'utf8')), 'default geometry matches the original homepage')
    writeFileSync(resolve('out/dashboard-geometry.json'), JSON.stringify(report, null, 2))
    writeFileSync(resolve('out/dashboard-default-preview.png'), (await reopened.webContents.capturePage()).toPNG())
    console.log('PASS: original homepage geometry at 1000, 1280 and 1500px; editing keeps widget dimensions')
    return
  }
  panel = await openPanel()
  await until(() => panel.webContents.executeJavaScript(`!document.querySelector('[aria-label="Refresh health data"]').disabled`), 'popup refresh enabled')
  todaySteps = 12345
  await panel.webContents.executeJavaScript(`document.querySelector('[aria-label="Refresh health data"]').click()`)
  await until(() => reopened.webContents.executeJavaScript("document.body.innerText.includes('12,345')"), 'popup refresh updates existing main page')
  await until(() => panel.webContents.executeJavaScript("document.body.innerText.includes('12,345')"), 'popup updated reading')
  blurHandlers.get(panel.id)()
  await until(() => !panel.isVisible(), 'popup hidden before main refresh')
  await delay(100) // Allow the renderer to apply the visibility notification.
  await until(() => panel.webContents.executeJavaScript(`!document.querySelector('[aria-label="Refresh health data"]').disabled`), 'hidden queries settled')
  const beforeHiddenRefresh = panelHealthRequests
  todaySteps = 12545
  await until(() => reopened.webContents.executeJavaScript(`!!document.querySelector('[aria-label="Refresh data"]')`), 'main refresh enabled')
  await reopened.webContents.executeJavaScript(`document.querySelector('[aria-label="Refresh data"]').click()`)
  await until(() => reopened.webContents.executeJavaScript("document.body.innerText.includes('12,545')"), 'main refreshed reading')
  await delay(100)
  assert.equal(panelHealthRequests, beforeHiddenRefresh, 'Hidden popup must not fetch after another window refreshes')
  panel = await openPanel()
  await until(() => panel.webContents.executeJavaScript("document.body.innerText.includes('12,545')"), 'hidden popup cache invalidated before stale timeout')
  if (checkDashboards) {
    const clickText = async (win, label) => {
      await until(() => win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('button')).some(b => b.textContent.trim() === ${JSON.stringify(label)} && !b.disabled)`), label + ' ready')
      await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === ${JSON.stringify(label)}).click()`)
    }
    const openPicker = async (win, slotLabel) => {
      const target = await win.webContents.executeJavaScript(`(() => {
        const button = document.querySelector('[aria-label="Change ${slotLabel}"]')
        button.scrollIntoView({ block: 'nearest' })
        const rect = button.getBoundingClientRect()
        return { x: Math.round(button.getAttribute('aria-label') === 'Change highlight 4' ? rect.right - 4 : rect.left + 4), y: Math.round(rect.top + rect.height / 2), width: rect.width, height: rect.height }
      })()`)
      assert.ok(target.width >= 36 && target.height >= 36, 'pencil has a generous click target')
      // Press the padding outside the glyph, through Chromium's actual hit testing.
      win.webContents.sendInputEvent({ type: 'mouseDown', x: target.x, y: target.y, button: 'left', clickCount: 1 })
      win.webContents.sendInputEvent({ type: 'mouseUp', x: target.x, y: target.y, button: 'left', clickCount: 1 })
      await until(() => pendingPicker !== null, 'native widget menu')
      await until(() => win.webContents.executeJavaScript(`document.querySelector('[aria-label="Change ${slotLabel}"]').getAttribute('aria-busy') === 'true'`), 'native picker request active')
      assert.equal(pendingPicker.options.window, win, 'picker belongs to the requesting window')
      const flatten = menu => menu.items.flatMap(item => [item, ...(item.submenu ? flatten(item.submenu) : [])])
      assert.equal(flatten(pendingPicker.menu).filter(item => item.checked).length, 1, 'current widget is checked')
      if (pendingPicker.menu.getMenuItemById('trend:steps:7')) {
        const metrics = [
          ['Activity', 'steps', ['1 day', '7 days', '30 days', '3 months', '1 year']],
          ['Heart', 'restingHeartRate', ['1 day', '7 days', '30 days', '3 months', '1 year']],
          ['Sleep', 'sleepMinutes', ['7 days', '30 days', '3 months', '1 year']]
        ]
        for (const [category, metric, periods] of metrics) {
          const group = pendingPicker.menu.items.find(item => item.label === category)
          const submenu = group?.submenu?.items.find(item => item.id === `metric:${metric}`)?.submenu
          assert.deepEqual(submenu?.items.map(item => item.label), periods, 'category → metric → period: ' + metric)
        }
      }
      assert.equal(await win.webContents.executeJavaScript(`!!document.querySelector('[role="dialog"]')`), false, 'no web picker dialog')
    }
    const dismissPicker = () => {
      const { options } = pendingPicker
      pendingPicker = null
      options.callback()
    }
    const choose = async (win, slotLabel, widget) => {
      await openPicker(win, slotLabel)
      const { menu } = pendingPicker
      const item = menu.getMenuItemById(widget)
      assert.ok(item, 'compatible widget is present in native menu: ' + widget)
      item.click(item, win, {})
      dismissPicker()
      await until(() => win.webContents.executeJavaScript(widget === 'remove-chart'
        ? `!document.querySelector('[aria-label="Change ${slotLabel}"]') && document.activeElement?.hasAttribute('data-menu-add-chart')`
        : `document.activeElement?.getAttribute('aria-label') === 'Change ${slotLabel}' && document.activeElement.getAttribute('aria-busy') === 'false'`), 'native picker restores focus')
    }
    const beforeLayouts = await reopened.webContents.executeJavaScript('window.pulse.dashboard.get()')
    const checkDraftPeriods = async (slotLabel, height) => {
      for (const [metric, axis, value, unit] of [['floors', 'floors', '3', 'floors'], ['sedentaryMinutes', 'min', '3m', ''], ['distanceKm', 'km', '20.00', 'km'], ['caloriesOut', 'kcal', '20', 'kcal'], ['steps', 'steps', '120', 'steps']]) {
        await choose(reopened, slotLabel, `intraday:${metric}`)
        await until(() => reopened.webContents.executeJavaScript(`document.querySelector('[data-dashboard-slot="chart1"] svg text[transform]')?.textContent === ${JSON.stringify(axis)}`), metric + ' has the correct axis unit')
        await reopened.webContents.executeJavaScript(`(() => {
          const hit = document.querySelector('[data-dashboard-slot="chart1"] svg rect[fill="transparent"]')
          hit.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }))
        })()`)
        await until(() => reopened.webContents.executeJavaScript(`!!document.querySelector('[data-dashboard-slot="chart1"] .pointer-events-none')`), metric + ' tooltip rendered')
        const tooltip = await reopened.webContents.executeJavaScript(`(() => {
          const row = document.querySelector('[data-dashboard-slot="chart1"] .pointer-events-none > div:last-child')
          return Array.from(row.querySelectorAll('span')).filter(span => span.textContent).map(span => span.textContent)
        })()`)
        assert.deepEqual(tooltip, unit ? [value, unit] : [value], slotLabel + ': ' + metric + ' tooltip uses the correct unit without duplicates')
      }
      for (const [widget, hint] of [['trend:steps:90', 'Last 3 months'], ['trend:steps:365', 'Last 1 year'], ['intraday:restingHeartRate', 'Across the day'], ['intraday:caloriesOut', 'Throughout the day'], ['intraday:steps', 'Steps per hour']]) {
        await choose(reopened, slotLabel, widget)
        await until(() => reopened.webContents.executeJavaScript(`(() => {
          const slot = document.querySelector('[data-dashboard-slot="chart1"]')
          return slot.textContent.includes(${JSON.stringify(hint)}) && !slot.querySelector('[aria-busy="true"]') && Array.from(slot.querySelectorAll('div')).some(div => div.style.height === '${height}px')
        })()`), widget + ' renders at the original chart height')
      }
    }
    writeFileSync(resolve('out/dashboard-home-default-preview.png'), (await reopened.webContents.capturePage()).toPNG())
    await clickText(reopened, 'Customize')
    await until(() => reopened.webContents.executeJavaScript(`!!document.querySelector('[aria-label="Change left chart"]')`), 'home editor renders before capture')
    writeFileSync(resolve('out/dashboard-edit-preview.png'), (await reopened.webContents.capturePage()).toPNG())
    for (const highlight of ['highlight 1', 'highlight 2', 'highlight 3', 'highlight 4']) {
      await openPicker(reopened, highlight)
      dismissPicker()
      await until(() => reopened.webContents.executeJavaScript(`document.querySelector('[aria-label="Change ${highlight}"]').getAttribute('aria-busy') === 'false'`), 'highlight picker dismissed')
    }
    await openPicker(reopened, 'left chart')
    dismissPicker()
    await delay(50)
    assert.deepEqual(await reopened.webContents.executeJavaScript('window.pulse.dashboard.get()'), beforeLayouts, 'dismissing native menu leaves saved preferences untouched')
    assert.ok(await reopened.webContents.executeJavaScript(`document.querySelector('[data-dashboard-slot="chart1"]').textContent.includes('Daily movement')`), 'dismissing native menu preserves draft')
    await choose(reopened, 'goal ring 1', 'goal:activeZoneMinutes')
    await choose(reopened, 'left chart', 'trend:steps:7')
    fixtureWorkouts = [{ id: 'draft-test-workout', name: 'Fixture walk', startTime: `${today}T09:00:00`, durationMin: 20, calories: 80, distanceKm: 1.5, avgHeartRate: 90, steps: 1500, activeZoneMinutes: 5 }]
    await reopened.webContents.executeJavaScript(`document.querySelector('[aria-label="Refresh data"]').click()`)
    await until(() => reopened.webContents.executeJavaScript(`!!document.querySelector('.workout-list button') && !!document.querySelector('[data-dashboard-slot="chart1"] rect[role="button"]')`), 'draft navigation fixtures ready')
    const draftSnapshot = `JSON.stringify(['ring1', 'chart1'].map(id => document.querySelector('[data-dashboard-slot="' + id + '"]')?.textContent))`
    const draftBeforeNavigation = await reopened.webContents.executeJavaScript(draftSnapshot)
    const navigationTargets = [
      '[data-dashboard-slot="ring1"] .dashboard-home-ring',
      '[data-dashboard-slot="summary1"] .home-hero-stat',
      '[data-dashboard-slot="signal1"] .group\\/stat',
      '[data-dashboard-slot="chart1"] .group\\/drill',
      '[data-dashboard-slot="chart2"] .group\\/drill',
      '[data-dashboard-slot="wide"] button[aria-label="Open workout details"]',
      '.workout-list button',
      '[data-dashboard-slot="chart1"] rect[role="button"]'
    ]
    for (const selector of navigationTargets) {
      await until(() => reopened.webContents.executeJavaScript(`!!document.querySelector(${JSON.stringify(selector)}) && !document.querySelector(${JSON.stringify(selector)}).disabled`), 'widget activation ready: ' + selector)
      for (const activation of ['click', 'Enter', 'Space']) {
        await reopened.webContents.executeJavaScript(`(() => {
          const target = document.querySelector(${JSON.stringify(selector)})
          target.scrollIntoView({ block: 'center' })
          target.focus()
          window.draftActivationObserved = false
          const button = target instanceof HTMLButtonElement
          target.addEventListener(${JSON.stringify(activation)} === 'click' || button ? 'click' : 'keydown', () => { window.draftActivationObserved = true }, { once: true })
          if (${JSON.stringify(activation)} === 'click') {
            target.dispatchEvent(new MouseEvent('click', { bubbles: true }))
          } else {
            // Hidden fixture windows do not receive native keyboard activation.
            // Exercise SVG key handlers and model the browser's button click.
            const key = ${JSON.stringify(activation === 'Space' ? ' ' : activation)}
            target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
            target.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }))
            if (button) target.click()
          }
        })()`)
        await delay(75)
        assert.equal(await reopened.webContents.executeJavaScript('window.draftActivationObserved'), true, 'widget received activation: ' + activation + ' ' + selector)
        assert.equal(await reopened.webContents.executeJavaScript(`!!document.querySelector('[aria-label="Change left chart"]')`), true, activation + ' must not leave customization: ' + selector)
        assert.equal(await reopened.webContents.executeJavaScript(draftSnapshot), draftBeforeNavigation, activation + ' must retain the draft: ' + selector)
      }
    }
    assert.deepEqual(await reopened.webContents.executeJavaScript('window.pulse.dashboard.get()'), beforeLayouts, 'blocked navigation never saves the draft')
    failActivityIntraday = true
    await choose(reopened, 'left chart', 'intraday:caloriesOut')
    await until(() => reopened.webContents.executeJavaScript(`!!document.querySelector('[data-dashboard-slot="chart1"] .dashboard-retry')`), 'failed draft chart offers Retry')
    failActivityIntraday = false
    const retryTarget = await reopened.webContents.executeJavaScript(`(() => {
      const retry = document.querySelector('[data-dashboard-slot="chart1"] .dashboard-retry')
      retry.scrollIntoView({ block: 'center' })
      const rect = retry.getBoundingClientRect()
      return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) }
    })()`)
    reopened.webContents.sendInputEvent({ type: 'mouseDown', ...retryTarget, button: 'left', clickCount: 1 })
    reopened.webContents.sendInputEvent({ type: 'mouseUp', ...retryTarget, button: 'left', clickCount: 1 })
    await until(() => reopened.webContents.executeJavaScript(`document.querySelector('[data-dashboard-slot="chart1"] svg text[transform]')?.textContent === 'kcal' && !!document.querySelector('[aria-label="Change left chart"]')`), 'Retry recovers the chart without leaving customization')
    fixtureWorkouts = []
    await clickText(reopened, 'Cancel')
    await reopened.webContents.executeJavaScript(`document.querySelector('[data-dashboard-slot="ring1"] .dashboard-home-ring').click()`)
    await until(() => reopened.webContents.executeJavaScript(`window.history.state?.detailMetric?.metric === 'steps' && !document.querySelector('[aria-label="Change left chart"]')`), 'normal widget navigation resumes after Cancel')
    await reopened.webContents.executeJavaScript('window.history.back()')
    await clickText(reopened, 'Customize')
    console.log('PASS: widget clicks, Enter and Space retain unsaved Home drafts; Retry works; Cancel restores normal navigation')
    await checkDraftPeriods('left chart', 170)
    failNextPicker = true
    await reopened.webContents.executeJavaScript(`document.querySelector('[aria-label="Change left chart"]').click()`)
    await until(() => reopened.webContents.executeJavaScript(`document.querySelector('[role="alert"]')?.textContent === 'Could not open menu. Try again.'`), 'native menu failure keeps editor usable')
    assert.ok(await reopened.webContents.executeJavaScript(`document.activeElement?.getAttribute('aria-label') === 'Change left chart'`), 'failed widget picker restores keyboard focus')
    await openPicker(reopened, 'left chart')
    const lateChoice = pendingPicker.menu.getMenuItemById('trend:hrvMs:30')
    await clickText(reopened, 'Restore defaults')
    lateChoice.click(lateChoice, reopened, {})
    dismissPicker()
    await until(() => reopened.webContents.executeJavaScript(`document.querySelector('[aria-label="Change left chart"]').getAttribute('aria-busy') === 'false'`), 'late picker selection settled')
    assert.ok(await reopened.webContents.executeJavaScript(`document.querySelector('[data-dashboard-slot="chart1"]').textContent.includes('Daily movement')`), 'late selection cannot overwrite restored defaults')
    await choose(reopened, 'left chart', 'trend:hrvMs:30')
    assert.ok(await reopened.webContents.executeJavaScript(`document.querySelector('[data-dashboard-slot="chart1"]').textContent.includes('Last 30 days')`))
    assert.deepEqual(await reopened.webContents.executeJavaScript('window.pulse.dashboard.get()'), beforeLayouts, 'draft is not persisted')
    await clickText(reopened, 'Cancel')
    await until(() => reopened.webContents.executeJavaScript(`document.querySelector('[data-dashboard-slot="chart1"]').textContent.includes('Daily movement')`), 'cancel restores original chart')
    await clickText(reopened, 'Customize')
    await choose(reopened, 'goal ring 1', 'goal:activeZoneMinutes')
    await choose(reopened, 'summary 1', 'summary:proteinG')
    await choose(reopened, 'left chart', 'trend:hrvMs:30')
    await choose(reopened, 'right chart', 'trend:proteinG:7')
    await choose(reopened, 'bottom card', 'trend:weightKg:30')
    // A simulated ordinary write failure must retain the complete draft.
    replace('dashboard:update', () => { throw new Error('Fixture layout save failure') })
    await clickText(reopened, 'Save layout')
    await until(() => reopened.webContents.executeJavaScript(`document.body.innerText.includes('Your changes are still here')`), 'failed save retains draft')
    assert.deepEqual(await reopened.webContents.executeJavaScript('window.pulse.dashboard.get()'), beforeLayouts)
    replace('dashboard:update', dashboardUpdateHandler)
    await clickText(reopened, 'Save layout')
    await until(() => reopened.webContents.executeJavaScript(`!document.querySelector('[aria-label="Change left chart"]')`), 'home saved')
    const homeLayouts = await reopened.webContents.executeJavaScript('window.pulse.dashboard.get()')
    assert.equal(homeLayouts.home.ring1.metric, 'activeZoneMinutes')
    assert.deepEqual(homeLayouts.menuBar, beforeLayouts.menuBar, 'home edit preserves menu bar')
    assert.ok(await reopened.webContents.executeJavaScript(`document.body.innerText.includes('90 g') && document.body.innerText.includes('26')`), 'replacement readings render')
    // Refresh only the selected widgets; removed specialised queries stay idle.
    const requestStart = mainRequestLog.length
    await until(() => reopened.webContents.executeJavaScript(`!document.querySelector('[aria-label="Refresh data"]').disabled`), 'main ready to refresh new layout')
    await reopened.webContents.executeJavaScript(`document.querySelector('[aria-label="Refresh data"]').click()`)
    await until(() => reopened.webContents.executeJavaScript(`!document.querySelector('[aria-label="Refresh data"]').disabled`), 'new layout refresh completed')
    const requests = mainRequestLog.slice(requestStart)
    assert.ok(requests.includes('health:series'))
    assert.ok(!requests.includes('health:sleep-range') && !requests.includes('health:intraday') && !requests.includes('health:workouts'), 'replaced widgets no longer request their data')
    await delay(1600) // Let chart entrance animations finish before capture.
    writeFileSync(resolve('out/dashboard-home-preview.png'), (await reopened.webContents.capturePage()).toPNG())
    // A renderer reload reads the persisted preference rather than a component draft.
    reopened.webContents.reload()
    await until(() => reopened.webContents.executeJavaScript(`document.querySelector('[data-dashboard-slot="chart1"]')?.textContent.includes('Last 30 days')`), 'home preference survives reload')
    console.log('PASS: homepage slot editing, cancel, failed save, persistence and reload')

    panel = panel.isVisible() ? panel : await openPanel()
    assert.equal(await panel.webContents.executeJavaScript(`!!document.querySelector('[aria-label="Customize menu bar"]')`), false, 'popup uses Settings for layout editing')
    const chartHeaderGeometry = `Array.from(document.querySelectorAll('.menu-section-title')).map(header => {
      const rect = header.getBoundingClientRect()
      const hint = header.querySelector('span').getBoundingClientRect()
      return { height: rect.height, hintInset: rect.right - hint.right }
    })`
    const originalChartHeaders = await panel.webContents.executeJavaScript(chartHeaderGeometry)
    await panel.webContents.executeJavaScript(`document.querySelector('[aria-label="Open settings"]').click()`)
    await clickText(reopened, 'Customize menu bar')
    await until(() => reopened.webContents.executeJavaScript(`!!document.querySelector('.dashboard-menu-preview')`), 'menu customization opens in Settings')
    assert.deepEqual(await reopened.webContents.executeJavaScript(chartHeaderGeometry), originalChartHeaders, 'chart pencils overlay the corner without moving period text or resizing the header')
    assert.equal(await reopened.webContents.executeJavaScript(`document.querySelector('[data-menu-bar-layout]').closest('[class~="bg-panel"]').querySelector('h3').textContent`), 'macOS menu bar', 'layout editor belongs to the macOS menu bar card')
    await delay(600)
    writeFileSync(resolve('out/dashboard-menu-settings-edit-preview.png'), (await reopened.webContents.capturePage()).toPNG())
    await checkDraftPeriods('top chart', 105)
    await choose(reopened, 'goal ring 2', 'goal:proteinG')
    await choose(reopened, 'summary 1', 'summary:waterMl')
    await choose(reopened, 'top chart', 'trend:weightKg:30')
    await choose(reopened, 'bottom chart', 'trend:hrvMs:7')
    panel = panel.isVisible() ? panel : await openPanel()
    assert.equal(await panel.webContents.executeJavaScript(`document.querySelector('[data-dashboard-slot="chart1"] h2').textContent`), 'Steps this week', 'menu draft does not update popup before save')
    await clickText(reopened, 'Save layout')
    await until(() => panel.webContents.executeJavaScript(`document.querySelector('[data-dashboard-slot="chart1"] h2')?.textContent === 'Weight' && document.querySelector('[data-dashboard-slot="ring2"]').textContent.includes('90')`), 'saved layout broadcasts to visible popup')
    const menuLayouts = await reopened.webContents.executeJavaScript('window.pulse.dashboard.get()')
    assert.deepEqual(menuLayouts.home, homeLayouts.home, 'menu edit preserves homepage')
    await delay(800)
    writeFileSync(resolve('out/dashboard-menu-preview.png'), (await panel.webContents.capturePage()).toPNG())
    await panel.webContents.executeJavaScript(`document.querySelector('[data-dashboard-slot="chart1"] .menu-section-title').click()`)
    await until(() => reopened.webContents.executeJavaScript(`window.history.state.detailMetric?.metric === 'weightKg' && window.history.state.detailMetric?.range === 'M'`), 'monthly trend navigation')
    console.log('PASS: Settings customization, independent layouts, live popup update and monthly navigation')

    panel = panel.isVisible() ? panel : await openPanel()
    assert.equal(await panel.webContents.executeJavaScript(`!!document.querySelector('[aria-label="Customize menu bar"]')`), false, 'popup uses Settings for layout editing')
    await panel.webContents.executeJavaScript(`document.querySelector('[aria-label="Open settings"]').click()`)
    await clickText(reopened, 'Customize menu bar')
    await until(() => reopened.webContents.executeJavaScript(`!!document.querySelector('.dashboard-menu-preview')`), 'menu editor reopened')
    await clickText(reopened, 'Restore defaults')
    await clickText(reopened, 'Cancel')
    assert.deepEqual((await reopened.webContents.executeJavaScript('window.pulse.dashboard.get()')).menuBar, menuLayouts.menuBar, 'cancelled reset leaves saved layout')
    await delay(200)
    const customizeStyle = await reopened.webContents.executeJavaScript(`(() => {
      const button = document.querySelector('[data-menu-bar-layout] .dashboard-action')
      const style = getComputedStyle(button)
      return { background: style.backgroundColor, border: style.borderTopWidth, shadow: style.boxShadow, width: button.getBoundingClientRect().width, rowWidth: button.parentElement.getBoundingClientRect().width }
    })()`)
    assert.equal(customizeStyle.background, 'rgba(0, 0, 0, 0)', 'customize has no button surface')
    assert.equal(customizeStyle.border, '0px')
    assert.equal(customizeStyle.shadow, 'none')
    assert.ok(customizeStyle.width < customizeStyle.rowWidth / 2, 'customize fits its label rather than filling the settings row')
    writeFileSync(resolve('out/dashboard-menu-settings-preview.png'), (await reopened.webContents.capturePage()).toPNG())
    await clickText(reopened, 'Customize menu bar')
    await clickText(reopened, 'Restore defaults')
    await clickText(reopened, 'Save layout')
    await until(() => reopened.webContents.executeJavaScript(`!document.querySelector('.dashboard-menu-preview')`), 'menu reset saved')
    const resetLayouts = await reopened.webContents.executeJavaScript('window.pulse.dashboard.get()')
    assert.deepEqual(resetLayouts.menuBar, beforeLayouts.menuBar)
    assert.deepEqual(resetLayouts.home, homeLayouts.home)
    console.log('PASS: reset defaults is scoped and can be cancelled')
    // Save, reload, and navigate using both new long periods on both surfaces.
    for (const surface of ['home', 'menuBar']) {
      const savedLayout = (await reopened.webContents.executeJavaScript('window.pulse.dashboard.get()'))[surface]
      for (const [days, range, hint] of [[90, '3M', 'Last 3 months'], [365, 'Y', 'Last 1 year']]) {
        await reopened.webContents.executeJavaScript(`window.pulse.app.open({ view: '${surface === 'home' ? 'home' : 'settings'}', date: '${today}' })`)
        await clickText(reopened, surface === 'home' ? 'Customize' : 'Customize menu bar')
        await choose(reopened, surface === 'home' ? 'left chart' : 'top chart', `trend:steps:${days}`)
        await clickText(reopened, 'Save layout')
        await until(async () => (await reopened.webContents.executeJavaScript('window.pulse.dashboard.get()'))[surface].chart1.days === days, 'long period saved')
        const chartWindow = surface === 'home' ? reopened : panel.isVisible() ? panel : await openPanel()
        chartWindow.webContents.reload()
        await until(() => chartWindow.webContents.executeJavaScript(`document.querySelector('[data-dashboard-slot="chart1"]')?.textContent.includes('${hint}')`), 'long period survives reload')
        await chartWindow.webContents.executeJavaScript(`document.querySelector('[data-dashboard-slot="chart1"] ${surface === 'home' ? 'button' : '.menu-section-title'}').click()`)
        await until(() => reopened.webContents.executeJavaScript(`window.history.state.detailMetric?.metric === 'steps' && window.history.state.detailMetric?.range === '${range}'`), surface + ' long period navigation')
      }
      await reopened.webContents.executeJavaScript(`window.pulse.dashboard.update('${surface}', ${JSON.stringify(savedLayout)})`)
    }
    console.log('PASS: both native menus group metric periods; intraday charts fit; 3-month/year choices persist, reload and navigate on both surfaces')
    panel = panel.isVisible() ? panel : await openPanel()
    const chartCount = win => win.webContents.executeJavaScript(`document.querySelectorAll('[data-dashboard-slot="chart1"], [data-dashboard-slot="chart2"]').length`)
    const addChart = async widget => {
      const slotId = await reopened.webContents.executeJavaScript(`['chart1', 'chart2'].find(id => !document.querySelector('[data-dashboard-slot="' + id + '"]'))`)
      await clickText(reopened, 'Add chart')
      await until(() => pendingPicker !== null, 'native add chart menu')
      assert.equal(pendingPicker.menu.getMenuItemById('remove-chart'), null, 'add menu only adds a chart')
      if (widget) {
        const item = pendingPicker.menu.getMenuItemById(widget)
        assert.ok(item, 'new chart can choose any supported widget')
        item.click(item, reopened, {})
      }
      dismissPicker()
      await until(() => reopened.webContents.executeJavaScript(`!document.querySelector('[data-menu-add-chart][aria-busy="true"]')`), 'add menu settled')
      if (widget) await until(() => reopened.webContents.executeJavaScript(`document.activeElement === document.querySelector('[data-dashboard-slot="${slotId}"] > .dashboard-slot-change')`), 'added chart receives keyboard focus')
    }
    await until(async () => await chartCount(panel) === 2, 'default charts restored before removal')
    const fullHeight = await panel.webContents.executeJavaScript('innerHeight')
    await reopened.webContents.executeJavaScript(`window.pulse.app.open({ view: 'settings', date: '${today}' })`)
    await clickText(reopened, 'Customize menu bar')
    await choose(reopened, 'top chart', 'remove-chart')
    assert.equal(await chartCount(reopened), 1)
    assert.ok(await reopened.webContents.executeJavaScript(`!!document.querySelector('[data-dashboard-slot="chart2"]')`), 'bottom chart survives removing the top chart')
    await clickText(reopened, 'Cancel')
    assert.deepEqual((await reopened.webContents.executeJavaScript('window.pulse.dashboard.get()')).menuBar, beforeLayouts.menuBar, 'cancel discards removal')
    await clickText(reopened, 'Customize menu bar')
    await choose(reopened, 'top chart', 'remove-chart')
    await choose(reopened, 'bottom chart', 'remove-chart')
    assert.equal(await chartCount(reopened), 0)
    panel = panel.isVisible() ? panel : await openPanel()
    await clickText(reopened, 'Save layout')
    await until(async () => await chartCount(panel) === 0 && await panel.webContents.executeJavaScript('innerHeight') < fullHeight, 'zero charts saved and popup shrinks')
    const emptyHeight = await panel.webContents.executeJavaScript('innerHeight')
    panel.webContents.reload()
    await until(() => panel.webContents.executeJavaScript(`!!document.querySelector('.menu-rings') && !document.querySelector('.menu-section-title')`), 'removed charts stay removed after reload')
    await until(() => panel.webContents.executeJavaScript(`document.body.innerText.includes('12,545')`), 'zero-chart readings ready')
    await delay(1600) // Finish the ring entrance animation before capturing the shorter popup.
    writeFileSync(resolve('out/dashboard-menu-no-charts-preview.png'), (await panel.webContents.capturePage()).toPNG())
    reopened.webContents.reload()
    await clickText(reopened, 'Customize menu bar')
    assert.equal(await chartCount(reopened), 0)
    await addChart(null)
    assert.equal(await chartCount(reopened), 0, 'dismissing Add leaves no chart placeholder')
    assert.ok(await reopened.webContents.executeJavaScript(`document.activeElement?.hasAttribute('data-menu-add-chart')`), 'dismissing Add restores keyboard focus')
    failNextPicker = true
    await clickText(reopened, 'Add chart')
    await until(() => reopened.webContents.executeJavaScript(`document.querySelector('[role="alert"]')?.textContent === 'Could not open menu. Try again.'`), 'failed add can be retried')
    assert.ok(await reopened.webContents.executeJavaScript(`document.activeElement?.hasAttribute('data-menu-add-chart')`), 'failed Add restores keyboard focus')
    await addChart('intraday:restingHeartRate')
    assert.equal(await chartCount(reopened), 1)
    await clickText(reopened, 'Save layout')
    await until(() => panel.webContents.executeJavaScript(`document.querySelector('.menu-section-title h2')?.textContent === 'Heart rate' && innerHeight > ${emptyHeight}`), 'one chart saved and popup grows')
    panel.webContents.reload()
    await until(() => panel.webContents.executeJavaScript(`document.querySelector('.menu-section-title h2')?.textContent === 'Heart rate'`), 'one chart survives reload')
    assert.equal(await chartCount(panel), 1)
    await clickText(reopened, 'Customize menu bar')
    await addChart('trend:steps:365')
    assert.equal(await chartCount(reopened), 2)
    assert.equal(await reopened.webContents.executeJavaScript(`!!document.querySelector('[data-menu-add-chart]')`), false, 'cannot add more than two charts')
    await clickText(reopened, 'Save layout')
    await until(async () => await chartCount(panel) === 2, 'both added charts broadcast to popup')
    await clickText(reopened, 'Customize menu bar')
    await choose(reopened, 'bottom chart', 'remove-chart')
    assert.equal(await chartCount(reopened), 1)
    await choose(reopened, 'top chart', 'remove-chart')
    await clickText(reopened, 'Restore defaults')
    assert.equal(await chartCount(reopened), 2, 'restore defaults brings back both charts')
    await clickText(reopened, 'Save layout')
    assert.deepEqual((await reopened.webContents.executeJavaScript('window.pulse.dashboard.get()')).home, homeLayouts.home, 'menu add/remove preserves homepage')
    panel = panel.isVisible() ? panel : await openPanel()
    await until(() => panel.webContents.executeJavaScript(`document.querySelector('[data-dashboard-slot="chart1"] h2')?.textContent === 'Steps this week' && document.querySelector('[data-dashboard-slot="chart2"] h2')?.textContent === 'Sleep stages'`), 'default charts restored to visible popup')
    console.log('PASS: optional menu charts support 0–2, cancel, picker dismissal/failure, saving, reload, resizing and restore defaults')
  }
  reopened.close()
  await until(() => reopened.isDestroyed(), 'main window closed')
  mainConnected = false
  todaySteps = 12145
  console.log('PASS: cross-window refresh and deferred hidden popup refresh')
  connected = false
  panel.webContents.send('chats:account-changed')
  await until(() => panel.webContents.executeJavaScript("document.body.innerText.includes('Connect your Fitbit account') && !document.body.innerText.includes('12,145')"), 'account disconnect clears metrics')
  console.log('PASS: disconnect clears data')
  connected = true
  missing = true
  panel.webContents.send('chats:account-changed')
  await until(() => panel.webContents.executeJavaScript("document.body.innerText.includes('No steps recorded this week') && document.body.innerText.includes('Sleep stages unavailable')"), 'missing data').catch(async error => { console.error('Missing-data fixture content:', await panel.webContents.executeJavaScript('document.body.innerText')); throw error })
  assert.ok(await panel.webContents.executeJavaScript(`document.querySelector('[aria-label="Open HRV details"]').textContent.includes('No data')`), 'Missing HRV must not render as zero')
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
  await panel.webContents.executeJavaScript(`window.__fixturePanelVisible = true; window.pulse.app.onPanelVisibility(visible => { window.__fixturePanelVisible = visible }); void 0`)
  blurHandlers.get(panel.id)()
  await until(() => !panel.isVisible(), 'blur hides panel')
  assert.equal(panel.isDestroyed(), false)
  await until(() => panel.webContents.executeJavaScript('window.__fixturePanelVisible === false'), 'renderer receives hide event')
  const hiddenRequests = healthRequests
  const hiddenRequestLogStart = fixtureRequestLog.length
  await delay(1100)
  assert.equal(healthRequests, hiddenRequests, 'hidden panel must not start new health requests: ' + JSON.stringify({ requests: fixtureRequestLog.slice(hiddenRequestLogStart), visible: panel.isVisible(), trace: visibilityTrace.slice(-12) }))
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
