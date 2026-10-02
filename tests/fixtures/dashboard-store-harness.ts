// Isolated module mocks; exercises ordinary preferences using a disposable profile.
import { afterAll, expect, mock, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, renameSync, mkdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { normalizeDashboardLayouts } from '../../src/shared/dashboard'
const directory = mkdtempSync(join(tmpdir(), 'openpulse-dashboard-test-'))
const path = join(directory, 'pulse-store.json')
const secretFixture = { unrelated: 'opaque-test-envelope' }
const localFixture = { session: { accountId: 'synthetic-account' } }
writeFileSync(
  path,
  JSON.stringify({
    settings: { menuBarEnabled: false, goals: { steps: 9000 }, chatRetention: 'forever' },
    secrets: secretFixture,
    local: localFixture
  })
)
let storageCalls = 0
mock.module('electron', () => ({
  app: { getPath: () => directory },
  safeStorage: new Proxy(
    {},
    {
      get: () => {
        storageCalls++
        throw new Error('Credential access must not be used by layout preferences')
      }
    }
  )
}))
const { getDashboardLayouts, updateDashboardLayout } = await import('../../src/main/store')
afterAll(() => rmSync(directory, { recursive: true, force: true }))

test('upgrades, independent surface saves, restart, rejection, and failed writes', async () => {
  const defaults = normalizeDashboardLayouts()
  expect(getDashboardLayouts()).toEqual(defaults)
  const home = {
    ...defaults.home,
    ring1: { kind: 'goal' as const, metric: 'sleepMinutes' as const },
    chart1: { kind: 'trend' as const, metric: 'steps' as const, days: 90 as const }
  }
  expect(updateDashboardLayout('home', home).home).toEqual(home)
  const menuBar = {
    ...defaults.menuBar,
    chart1: { kind: 'trend' as const, metric: 'hrvMs' as const, days: 365 as const },
    chart2: { kind: 'intraday' as const, metric: 'restingHeartRate' as const }
  }
  expect(updateDashboardLayout('menuBar', menuBar)).toEqual({ version: 1, home, menuBar })
  const persisted = JSON.parse(readFileSync(path, 'utf8'))
  expect(persisted.secrets).toEqual(secretFixture)
  expect(persisted.local).toEqual(localFixture)
  expect(statSync(path).mode & 0o777).toBe(0o600)
  expect(persisted.settings.menuBarEnabled).toBe(false)
  expect(persisted.settings.goals.steps).toBe(9000)
  const restarted = await import(`../../src/main/store.ts?restart=${Date.now()}`)
  expect(restarted.getDashboardLayouts()).toEqual({ version: 1, home, menuBar })
  expect(() =>
    updateDashboardLayout('home', { ...home, ring1: { kind: 'goal', metric: 'weightKg' } })
  ).toThrow()
  expect(readFileSync(path, 'utf8')).toBe(JSON.stringify(persisted, null, 2))
  // Deterministic write failure even when tests run with elevated permissions.
  renameSync(path, `${path}.saved`)
  mkdirSync(path)
  expect(() => updateDashboardLayout('home', defaults.home)).toThrow()
  expect(getDashboardLayouts()).toEqual({ version: 1, home, menuBar })
  expect(storageCalls).toBe(0)
})
