import { app, safeStorage } from 'electron'
import { join } from 'node:path'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import type { AppSettings } from '../shared/types'

interface StoreFile {
  settings: AppSettings
  // name -> base64(safeStorage-encrypted JSON)
  secrets: Record<string, string>
}

const DEFAULTS: AppSettings = {
  googleClientId: '',
  googleClientSecret: '',
  googleClientSecretConfigured: false
}
const GOOGLE_CLIENT_SECRET_KEY = 'google-client-secret'

let cache: StoreFile | null = null

function normalizeSettings(raw?: Partial<AppSettings>): AppSettings {
  return {
    googleClientId: raw?.googleClientId ?? DEFAULTS.googleClientId,
    googleClientSecret: '',
    googleClientSecretConfigured: false
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
