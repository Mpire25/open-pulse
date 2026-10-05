import { normalizeDashboardLayouts, validateDashboardLayout, type DashboardLayouts, type DashboardSurface } from '../shared/dashboard'
import { app, safeStorage } from 'electron'
import { join } from 'node:path'
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import {
  ASSISTANT_MODEL_PATTERN,
  CHAT_RETENTIONS,
  DEFAULT_ASSISTANT,
  DEFAULT_GOALS,
  REASONING_EFFORT_PATTERN,
  type AppSettings,
  type AssistantSettings,
  type ChatRetention,
  type Goals
} from '../shared/types'

interface StoreFile {
  settings: AppSettings
  local?: Record<string, unknown>
  dashboardLayouts: DashboardLayouts
  // name -> base64(safeStorage-encrypted JSON)
  secrets: Record<string, string>
}

const DEFAULTS: AppSettings = {
  menuBarEnabled: true,
  responseNotificationsEnabled: false,
  responseNotificationSound: false,
  responseNotificationPreviews: false,
  googleClientId: '',
  googleClientSecret: '',
  googleClientSecretConfigured: false,
  goals: { ...DEFAULT_GOALS },
  assistant: { ...DEFAULT_ASSISTANT },
  // Retention is opt-in: an upgrade must never silently delete existing chats.
  chatRetention: 'forever'
}
const GOOGLE_CLIENT_SECRET_KEY = 'google-client-secret'

let cache: StoreFile | null = null

function normalizeGoals(raw?: Partial<Goals>): Goals {
  const positive = (v: unknown, fallback: number): number => {
    const n = Number(v)
    return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback
  }
  return {
    steps: positive(raw?.steps, DEFAULT_GOALS.steps),
    activeZoneMinutes: positive(raw?.activeZoneMinutes, DEFAULT_GOALS.activeZoneMinutes),
    caloriesOut: positive(raw?.caloriesOut, DEFAULT_GOALS.caloriesOut),
    caloriesIn: positive(raw?.caloriesIn, DEFAULT_GOALS.caloriesIn),
    proteinG: positive(raw?.proteinG, DEFAULT_GOALS.proteinG),
    carbsG: positive(raw?.carbsG, DEFAULT_GOALS.carbsG),
    fatG: positive(raw?.fatG, DEFAULT_GOALS.fatG),
    sleepMinutes: positive(raw?.sleepMinutes, DEFAULT_GOALS.sleepMinutes)
  }
}

function normalizeAssistant(raw?: Partial<AssistantSettings>): AssistantSettings {
  const model = String(raw?.model ?? '').trim()
  const effort = raw?.reasoningEffort
  return {
    model: ASSISTANT_MODEL_PATTERN.test(model) ? model : DEFAULT_ASSISTANT.model,
    reasoningEffort:
      typeof effort === 'string' && REASONING_EFFORT_PATTERN.test(effort)
        ? effort : DEFAULT_ASSISTANT.reasoningEffort
  }
}

function normalizeSettings(raw?: Partial<AppSettings>): AppSettings {
  const chatRetention = raw?.chatRetention as ChatRetention | undefined
  return {
    menuBarEnabled: typeof raw?.menuBarEnabled === 'boolean' ? raw.menuBarEnabled : DEFAULTS.menuBarEnabled,
    responseNotificationsEnabled: raw?.responseNotificationsEnabled === true,
    responseNotificationSound: raw?.responseNotificationSound === true,
    responseNotificationPreviews: raw?.responseNotificationPreviews === true,
    googleClientId: raw?.googleClientId ?? DEFAULTS.googleClientId,
    googleClientSecret: '',
    googleClientSecretConfigured: false,
    goals: normalizeGoals(raw?.goals),
    assistant: normalizeAssistant(raw?.assistant),
    chatRetention: chatRetention && CHAT_RETENTIONS.includes(chatRetention)
      ? chatRetention
      : DEFAULTS.chatRetention
  }
}

function filePath(): string {
  return join(app.getPath('userData'), 'pulse-store.json')
}

function load(): StoreFile {
  if (cache) return cache
  if (existsSync(filePath())) {
    try {
      const raw = JSON.parse(readFileSync(filePath(), 'utf8')) as Partial<StoreFile>
      cache = {
        settings: normalizeSettings(raw.settings),
        dashboardLayouts: normalizeDashboardLayouts(raw.dashboardLayouts),
        secrets: raw.secrets ?? {},
        local: raw.local ?? {}
      }
      return cache
    } catch {
      // corrupt store: fall through to defaults
    }
  }
  cache = { settings: { ...DEFAULTS }, dashboardLayouts: normalizeDashboardLayouts(), secrets: {} }
  return cache
}

function persist(store: StoreFile = load()): void {
  const temporary = `${filePath()}.tmp`
  writeFileSync(temporary, JSON.stringify(store, null, 2), { encoding: 'utf8', mode: 0o600 })
  renameSync(temporary, filePath())
}

/** Read the desktop preference at startup without opening credential storage. */
export function getMenuBarEnabled(): boolean {
  return load().settings.menuBarEnabled
}

/** Notification delivery must never open credential storage. */
export function getResponseNotificationPreferences(): { enabled: boolean; sound: boolean; previews: boolean } {
  const settings = load().settings
  return { enabled: settings.responseNotificationsEnabled, sound: settings.responseNotificationSound, previews: settings.responseNotificationPreviews }
}

export function getSettings(): AppSettings {
  const settings = load().settings
  return {
    ...settings,
    googleClientSecret: '',
    googleClientSecretConfigured: Boolean(getGoogleClientSecret())
  }
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const store = load()
  const { googleClientSecret, googleClientSecretConfigured, ...settingsPatch } = patch
  store.settings = normalizeSettings({ ...store.settings, ...settingsPatch })
  store.settings.googleClientSecret = ''
  store.settings.googleClientSecretConfigured = false
  if (googleClientSecret != null) {
    if (googleClientSecret) setSecret(GOOGLE_CLIENT_SECRET_KEY, googleClientSecret)
    else deleteSecret(GOOGLE_CLIENT_SECRET_KEY)
  }
  persist()
  return getSettings()
}

/** Layout preferences never need to decrypt credentials. */
export function getDashboardLayouts(): DashboardLayouts {
  return normalizeDashboardLayouts(load().dashboardLayouts)
}

export function updateDashboardLayout(surface: DashboardSurface, raw: unknown): DashboardLayouts {
  const layout = validateDashboardLayout(surface, raw)
  const store = load()
  const next = { ...getDashboardLayouts(), [surface]: layout }
  // Write before updating the cache, so a failed save keeps the last saved layout.
  persist({ ...store, dashboardLayouts: next })
  store.dashboardLayouts = next
  return getDashboardLayouts()
}

export function getGoogleClientSecret(): string {
  return getSecret<string>(GOOGLE_CLIENT_SECRET_KEY) ?? ''
}

let storageFailure: Error | null = null

function assertSecureStorage(): void {
  if (storageFailure) throw storageFailure
  if (!safeStorage.isEncryptionAvailable()) {
    storageFailure = new Error('Secure credential storage is unavailable. Please handle Keychain access manually before restarting OpenPulse.')
    throw storageFailure
  }
}

export function hasSecret(name: string): boolean {
  return Boolean(load().secrets[name])
}

export function getLocalValue<T>(name: string): T | undefined {
  return load().local?.[name] as T | undefined
}

export function setLocalValue(name: string, value: unknown): void {
  const store = load()
  const previous = store.local
  store.local = { ...previous, [name]: value }
  try { persist() } catch (error) { store.local = previous; throw error }
}

export function setSecret(name: string, value: unknown): void {
  assertSecureStorage()
  const store = load()
  let encrypted: string
  try {
    encrypted = safeStorage.encryptString(JSON.stringify(value)).toString('base64')
  } catch {
    storageFailure = new Error('Secure credential storage authentication failed. Handle Keychain access manually; OpenPulse will not retry this session.')
    throw storageFailure
  }
  const previous = store.secrets
  store.secrets = { ...previous, [name]: encrypted }
  try { persist() } catch (error) { store.secrets = previous; throw error }
}

export function getSecret<T>(name: string): T | null {
  const stored = load().secrets[name]
  if (!stored) return null
  assertSecureStorage()
  try {
    return JSON.parse(safeStorage.decryptString(Buffer.from(stored, 'base64'))) as T
  } catch {
    storageFailure = new Error('Secure credential storage decryption failed. Handle Keychain access manually; OpenPulse will not retry this session.')
    throw storageFailure
  }
}

export function deleteSecret(name: string): void {
  if (storageFailure) throw storageFailure
  const store = load()
  const previous = store.secrets
  store.secrets = { ...previous }
  delete store.secrets[name]
  try { persist() } catch (error) { store.secrets = previous; throw error }
}
