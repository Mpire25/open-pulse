import type {
  AssistantModel,
  ModelCatalog
} from '../shared/types'
import { ASSISTANT_MODEL_PATTERN, REASONING_EFFORT_PATTERN } from '../shared/types'
import {
  getCodexAuthGeneration,
  getCodexStatus,
  getCodexTokens,
  isCodexAuthGenerationCurrent
} from './codex-auth'
import { getLocalValue, setLocalValue } from './store'
import { TokenExchangeError, CHATGPT_RESOURCE } from './chatgpt-protocol'
import { ChatGPTRequestError, responseError } from './chatgpt-responses'
import { CHAT_TITLE_MODEL, type ChatTitleModel } from './chat-title-generator'
const MAX_AGE = 6 * 60 * 60_000
const pending = new Map<string, Promise<ModelCatalog>>()

export function selectChatTitleModels(models: AssistantModel[], assistantModel: string): ChatTitleModel[] {
  const catalogEffort = (model?: AssistantModel): ChatTitleModel['reasoningEffort'] => {
    if (model?.supportsNoReasoning) return 'none'
    return model?.efforts?.find((effort) => effort !== 'auto')
  }
  const luna = models.find((model) => model.id === CHAT_TITLE_MODEL)
  const result: ChatTitleModel[] = []
  if (luna) {
    result.push({ model: luna.id, reasoningEffort: catalogEffort(luna) })
  }
  if (!result.some((model) => model.model === assistantModel) && ASSISTANT_MODEL_PATTERN.test(assistantModel)) {
    result.push({ model: assistantModel, reasoningEffort: catalogEffort(models.find((model) => model.id === assistantModel)) })
  }
  return result
}

/** Reuses the foreground run's credentials; never opens secure storage. */
export async function getChatTitleModels(
  tokens: { accessToken: string; clientId: string }, assistantModel: string, signal: AbortSignal
): Promise<ChatTitleModel[]> {
  const cached = getLocalValue<ModelCatalog>(`chatgpt-models:${tokens.clientId}`)
  let models = cached?.models
  if (cached?.effortsVersion !== 2 || !cached.fetchedAt || cached.stale || Date.now() - cached.fetchedAt >= MAX_AGE) {
    try {
      const response = await fetch(`${CHATGPT_RESOURCE}/models`, {
        headers: { authorization: `Bearer ${tokens.accessToken}` }, signal
      })
      if (!response.ok) throw responseError(await response.json().catch(() => null), response.status, response.headers.get('x-request-id'))
      models = parseModels(await response.json())
    } catch (error) {
      if (signal.aborted || (error instanceof ChatGPTRequestError && error.stopInference)) throw error
      models = (cached?.models ?? []).filter((model) => model.id === assistantModel)
    }
  }
  return selectChatTitleModels(models ?? [], assistantModel)
}

export function parseModels(value: unknown): AssistantModel[] {
  if (
    !value ||
    typeof value !== 'object' ||
    !Array.isArray((value as { models?: unknown }).models)
  )
    throw new Error('ChatGPT returned an invalid model catalog.')
  const seen = new Set<string>()
  return (value as { models: unknown[] }).models.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return []
    const model = raw as {
      slug?: unknown
      display_name?: unknown
      visibility?: unknown
      supported_reasoning_levels?: unknown
    }
    if (
      model.visibility !== 'list' ||
      typeof model.slug !== 'string' ||
      !ASSISTANT_MODEL_PATTERN.test(model.slug) ||
      seen.has(model.slug)
    )
      return []
    seen.add(model.slug)
    const levels = Array.isArray(model.supported_reasoning_levels)
      ? model.supported_reasoning_levels
      : []
    const efforts = levels.flatMap((level) => {
      const effort =
        typeof level === 'string'
          ? level
          : level && typeof level === 'object'
            ? level.effort
            : undefined
      return typeof effort === 'string' &&
        effort !== 'auto' &&
        REASONING_EFFORT_PATTERN.test(effort)
        ? [effort]
        : []
    })
    return [
      {
        id: model.slug,
        label:
          typeof model.display_name === 'string' && model.display_name
            ? model.display_name
            : model.slug,
        ...(efforts.length
          ? { efforts: [...new Set(efforts)] }
          : {}),
        ...(levels.some((level) => typeof level === 'string' ? level === 'none' : level?.effort === 'none')
          ? { supportsNoReasoning: true as const } : {})
      }
    ]
  })
}

export async function getChatGPTModels(force = false): Promise<ModelCatalog> {
  const generation = getCodexAuthGeneration()
  const status = getCodexStatus()
  if (!status.connected || !status.activeRegistration)
    return {
      models: [],
      stale: true,
      error: 'Connect your ChatGPT plan to load models.'
    }
  const key = `chatgpt-models:${status.activeRegistration}`
  const cached = getLocalValue<ModelCatalog>(key)
  if (!force && cached?.effortsVersion === 2 && cached.fetchedAt && Date.now() - cached.fetchedAt < MAX_AGE)
    return cached
  let tokens
  try {
    tokens = await getCodexTokens()
  } catch (error) {
    const temporary =
      error instanceof TypeError ||
      (error instanceof DOMException && error.name === 'TimeoutError') ||
      (error instanceof TokenExchangeError && error.status >= 500)
    if (!temporary || !isCodexAuthGenerationCurrent(generation)) throw error
    return {
      models: cached?.models ?? [],
      fetchedAt: cached?.fetchedAt,
      stale: true,
      registrationId: status.activeRegistration,
      error:
        'Could not renew the ChatGPT session while offline. Showing saved choices.'
    }
  }
  if (!tokens || !isCodexAuthGenerationCurrent(generation))
    throw new Error('ChatGPT account changed.')
  const existing = pending.get(key)
  if (existing) return existing
  const operation = (async (): Promise<ModelCatalog> => {
    let catalog: ModelCatalog
    try {
      const response = await fetch(`${CHATGPT_RESOURCE}/models`, {
        headers: { authorization: `Bearer ${tokens.accessToken}` },
        signal: AbortSignal.timeout(20_000)
      })
      if (!response.ok)
        throw responseError(
          await response.json().catch(() => null),
          response.status,
          response.headers.get('x-request-id')
        )
      const models = parseModels(await response.json())
      catalog = {
        models,
        fetchedAt: Date.now(),
        stale: false,
        registrationId: tokens.clientId,
        effortsVersion: 2
      }
    } catch (error) {
      catalog = {
        models: cached?.models ?? [],
        fetchedAt: cached?.fetchedAt,
        stale: true,
        registrationId: tokens.clientId,
        error:
          error instanceof Error
            ? error.message
            : 'Could not refresh ChatGPT models.'
      }
    }
    if (!isCodexAuthGenerationCurrent(generation))
      throw new Error('ChatGPT account changed.')
    if (!catalog.stale) setLocalValue(key, catalog)
    return catalog
  })()
  pending.set(key, operation)
  try {
    return await operation
  } finally {
    if (pending.get(key) === operation) pending.delete(key)
  }
}
