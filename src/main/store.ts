import { app, safeStorage } from 'electron'
import { join } from 'node:path'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import {
  ASSISTANT_MODEL_PATTERN,
  CHAT_RETENTIONS,
  DEFAULT_ASSISTANT,
  DEFAULT_GOALS,
  REASONING_EFFORTS,
  type AppSettings,
  type AssistantSettings,
  type ChatRetention,
  type Goals,
  type ReasoningEffort
} from '../shared/types'

interface StoreFile {
  settings: AppSettings
  // name -> base64(safeStorage-encrypted JSON)
  secrets: Record<string, string>
}

const DEFAULTS: AppSettings = {
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
  const effort = raw?.reasoningEffort as ReasoningEffort | undefined
  return {
    model: ASSISTANT_MODEL_PATTERN.test(model) ? model : DEFAULT_ASSISTANT.model,
    reasoningEffort:
      effort && REASONING_EFFORTS.includes(effort) ? effort : DEFAULT_ASSISTANT.reasoningEffort
  }
}

function normalizeSettings(raw?: Partial<AppSettings>): AppSettings {
  const chatRetention = raw?.chatRetention as ChatRetention | undefined
  return {
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
        secrets: raw.secrets ?? {}
      }
      return cache
    } catch {
      // corrupt store: fall through to defaults
    }
  }
  cache = { settings: { ...DEFAULTS }, secrets: {} }
  return cache
}

function persist(): void {
  writeFileSync(filePath(), JSON.stringify(load(), null, 2), 'utf8')
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

export function getGoogleClientSecret(): string {
  return getSecret<string>(GOOGLE_CLIENT_SECRET_KEY) ?? ''
}

export function setSecret(name: string, value: unknown): void {
  const store = load()
  const plain = JSON.stringify(value)
  const encrypted = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(plain).toString('base64')
    : Buffer.from(plain, 'utf8').toString('base64')
  store.secrets[name] = encrypted
  persist()
}

export function getSecret<T>(name: string): T | null {
  const stored = load().secrets[name]
  if (!stored) return null
  try {
    const buf = Buffer.from(stored, 'base64')
    const plain = safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(buf)
      : buf.toString('utf8')
    return JSON.parse(plain) as T
  } catch {
    return null
  }
}

export function deleteSecret(name: string): void {
  const store = load()
  delete store.secrets[name]
  persist()
}
