// Loads a checkout's real assistant (codex-chat, its tools, prompts and loop)
// with three things swapped out:
// - health-service and metric-store serve the deterministic fixture;
// - store keeps the eval's own ChatGPT session in a private file instead of
//   the app's Keychain-encrypted store, and supplies the model settings;
// - electron's shell opens the sign-in page with `open`.
// Everything else, including sign-in, token refresh and the Responses API
// calls, is the checkout's own code. Module mocks are process-global, so a
// process evaluates exactly one checkout.

import { mock } from 'bun:test'
import { AsyncLocalStorage } from 'node:async_hooks'
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  ASSISTANT_MODEL_PATTERN,
  DEFAULT_ASSISTANT,
  REASONING_EFFORT_PATTERN,
  type AssistantSettings
} from '../src/shared/types'
import type { ModelRequest } from './checks'
import { cachedCoverage, createHealthFixture, evalNow, type HealthCall } from './fixture'

const RESPONSES_URL = 'https://api.openai.com/v1/responses'
// OPENPULSE_EVALS_DIR moves the session elsewhere (the offline tests use a temp dir).
export function sessionDir(): string {
  return process.env.OPENPULSE_EVALS_DIR ?? join(homedir(), '.config', 'openpulse-evals')
}

function sessionFile(): string {
  return join(sessionDir(), 'store.json')
}

export interface RunContext {
  healthCalls: HealthCall[]
  modelRequests: ModelRequest[]
  /** The recorder's reads of each response stream, awaited before scoring. */
  recordings: Array<Promise<void>>
}

export const runContext = new AsyncLocalStorage<RunContext>()

let calendarClockInstalled = false

/**
 * Freeze no-argument Date construction to the fixture's run date, including
 * in older checkouts. Date.now remains real for latency and token expiry;
 * explicit timestamps and calendar-date construction keep their usual meaning.
 */
function installEvalCalendarClock(): void {
  if (calendarClockInstalled) return
  globalThis.Date = new Proxy(globalThis.Date, {
    construct: (target, args, newTarget) =>
      Reflect.construct(target, args.length ? args : [evalNow().getTime()], newTarget),
    apply: () => evalNow().toString()
  })
  calendarClockInstalled = true
}

// ---------------------------------------------------------------------------
// The eval's private session store (0600, outside the repository)

interface SessionFile {
  secrets: Record<string, unknown>
  local: Record<string, unknown>
}

function readSession(): SessionFile {
  try {
    const parsed = JSON.parse(readFileSync(sessionFile(), 'utf8')) as Partial<SessionFile>
    return { secrets: parsed.secrets ?? {}, local: parsed.local ?? {} }
  } catch {
    return { secrets: {}, local: {} }
  }
}

function writeSession(session: SessionFile): void {
  mkdirSync(sessionDir(), { recursive: true, mode: 0o700 })
  chmodSync(sessionDir(), 0o700)
  const temporary = `${sessionFile()}.tmp`
  writeFileSync(temporary, JSON.stringify(session), { encoding: 'utf8', mode: 0o600 })
  renameSync(temporary, sessionFile())
}

export function hasSessionFile(): boolean {
  return existsSync(sessionFile())
}

/**
 * The model settings saved in the app, normalised the way the app does, so
 * evals use what the app uses. Invalid saved values fall back to the defaults.
 */
export function appAssistantSettings(): AssistantSettings {
  let saved: Partial<AssistantSettings> = {}
  try {
    const path = join(homedir(), 'Library', 'Application Support', 'OpenPulse', 'pulse-store.json')
    saved = (JSON.parse(readFileSync(path, 'utf8')) as { settings?: { assistant?: Partial<AssistantSettings> } }).settings?.assistant ?? {}
  } catch {
    // No saved settings: use the defaults.
  }
  const model = String(saved.model ?? '').trim()
  const effort = saved.reasoningEffort
  return {
    model: ASSISTANT_MODEL_PATTERN.test(model) ? model : DEFAULT_ASSISTANT.model,
    reasoningEffort:
      typeof effort === 'string' && effort !== 'auto' && REASONING_EFFORT_PATTERN.test(effort)
        ? effort
        : DEFAULT_ASSISTANT.reasoningEffort
  }
}

// ---------------------------------------------------------------------------
// Recording model requests

function bodyOf(init?: RequestInit): Record<string, unknown> | null {
  try {
    return typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function toolNames(tools: unknown): string[] {
  if (!Array.isArray(tools)) return []
  return tools.flatMap((tool) => {
    const entry = tool as { type?: string; name?: string; tools?: Array<{ name?: string }> }
    if (Array.isArray(entry.tools)) return entry.tools.flatMap((child) => (child.name ? [child.name] : []))
    return entry.name ? [entry.name] : entry.type ? [entry.type] : []
  })
}

async function readStream(stream: ReadableStream<Uint8Array>, request: ModelRequest): Promise<void> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const handle = (line: string): void => {
    if (!line.startsWith('data:')) return
    const data = line.slice(5).trim()
    if (!data || data === '[DONE]') return
    try {
      const event = JSON.parse(data) as {
        type?: string
        item?: { type?: string; name?: string }
        response?: { usage?: Record<string, any> }
      }
      if (event.type === 'response.output_item.done' && event.item?.type === 'function_call') {
        request.functionCalls.push(event.item.name ?? '?')
      }
      if (event.type === 'response.completed' && event.response?.usage) {
        const usage = event.response.usage
        request.inputTokens = usage.input_tokens
        request.cachedTokens = usage.input_tokens_details?.cached_tokens
        request.outputTokens = usage.output_tokens
        request.reasoningTokens = usage.output_tokens_details?.reasoning_tokens
      }
    } catch {
      // Partial or non-JSON frames carry nothing the eval needs.
    }
  }
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      request.firstByteMs ??= Date.now() - request.startedAt
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      lines.forEach(handle)
    }
    handle(buffer)
  } catch {
    // The run was cancelled; whatever was recorded stands.
  } finally {
    request.durationMs = Date.now() - request.startedAt
  }
}

function installFetchRecorder(): void {
  const realFetch = globalThis.fetch
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const context = runContext.getStore()
    if (!context || url !== RESPONSES_URL) return realFetch(input, init)
    const body = bodyOf(init)
    const tools = toolNames(body?.tools)
    const request: ModelRequest = {
      kind: tools.includes('web_search') ? 'research' : 'agent',
      tools,
      toolChoice: typeof body?.tool_choice === 'string' ? body.tool_choice : undefined,
      startedAt: Date.now(),
      functionCalls: []
    }
    context.modelRequests.push(request)
    const response = await realFetch(input, init)
    if (!response.body) return response
    const [forApp, forRecorder] = response.body.tee()
    context.recordings.push(readStream(forRecorder, request))
    return new Response(forApp, { status: response.status, statusText: response.statusText, headers: response.headers })
  }) as typeof fetch
}

// ---------------------------------------------------------------------------
// Loading a checkout

export interface AssistantUnderTest {
  runChat: typeof import('../src/main/codex-chat').runChat
  cancelChat: typeof import('../src/main/codex-chat').cancelChat
  connectCodex: typeof import('../src/main/codex-auth').connectCodex
  disconnectCodex: typeof import('../src/main/codex-auth').disconnectCodex
  getCodexStatus: typeof import('../src/main/codex-auth').getCodexStatus
}

export async function loadAssistant(root: string, assistant: AssistantSettings): Promise<AssistantUnderTest> {
  const main = join(root, 'src', 'main')
  installEvalCalendarClock()

  mock.module('electron', () => ({
    shell: {
      openExternal: async (url: string) => {
        console.log(`\nOpening ChatGPT sign-in in your browser. If it does not open, visit:\n${url}\n`)
        Bun.spawn(['open', url])
      }
    }
  }))

  mock.module(join(main, 'store.ts'), () => ({
    getSettings: () => ({
      menuBarEnabled: false,
      responseNotificationsEnabled: false,
      responseNotificationSound: false,
      responseNotificationPreviews: false,
      googleClientId: '',
      googleClientSecret: '',
      googleClientSecretConfigured: false,
      goals: {},
      assistant,
      chatRetention: 'forever'
    }),
    updateSettings: () => {
      throw new Error('Evals do not change settings.')
    },
    getMenuBarEnabled: () => false,
    getResponseNotificationPreferences: () => ({ enabled: false, sound: false, previews: false }),
    getDashboardLayouts: () => ({}),
    updateDashboardLayout: () => ({}),
    getGoogleClientSecret: () => '',
    hasSecret: (name: string) => name in readSession().secrets,
    getSecret: <T>(name: string): T | null => (readSession().secrets[name] as T | undefined) ?? null,
    setSecret: (name: string, value: unknown) => {
      const session = readSession()
      session.secrets[name] = value
      writeSession(session)
    },
    deleteSecret: (name: string) => {
      const session = readSession()
      delete session.secrets[name]
      writeSession(session)
    },
    getLocalValue: <T>(name: string): T | undefined => readSession().local[name] as T | undefined,
    setLocalValue: (name: string, value: unknown) => {
      const session = readSession()
      session.local[name] = value
      writeSession(session)
    }
  }))

  const fixture = createHealthFixture((call) => runContext.getStore()?.healthCalls.push(call))
  mock.module(join(main, 'health-service.ts'), () => fixture)
  mock.module(join(main, 'metric-store.ts'), () => ({ archivedMetricCoverage: () => cachedCoverage() }))

  installFetchRecorder()

  const chat = await import(join(main, 'codex-chat.ts'))
  const auth = await import(join(main, 'codex-auth.ts'))
  return {
    runChat: chat.runChat,
    cancelChat: chat.cancelChat,
    connectCodex: auth.connectCodex,
    disconnectCodex: auth.disconnectCodex,
    getCodexStatus: auth.getCodexStatus
  }
}
