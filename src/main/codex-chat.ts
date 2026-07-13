// AI assistant backed by the Codex responses endpoint, authenticated with the
// user's ChatGPT account. Runs an agentic tool loop: the model can query the
// user's health data (live or demo) before answering.

import type { WebContents } from 'electron'
import type { AiEvent, AssistantVisualPart, ChatMessage } from '../shared/types'
import {
  getCodexAuthGeneration,
  getCodexTokens,
  isCodexAuthGenerationCurrent
} from './codex-auth'
import { AGENT_TOOLS, AGENT_TOOL_LABELS, runHealthAgentTool } from './health-agent-tools'
import { healthAgentModelData } from './health-agent-analysis'
import { addUrlCitations, countValidUrlCitations, type UrlCitationAnnotation } from './ai-citations'
import {
  PRESENTATION_TOOL,
  resolveAutomaticPresentation,
  resolvePresentation,
  type AgentDataset
} from './assistant-presentation'
import { AgentTracer, summarizeToolArguments, summarizeToolResult } from './agent-trace'
import {
  CITATION_REPAIR_INSTRUCTION,
  researchCompletionAction,
  researchPolicyForRequest,
  sanitizeWebSearchAction,
  UNCITED_RESEARCH_MESSAGE,
  webResearchAvailable,
  type ResearchPolicy
} from './agent-research'
import { SLEEP_DATE_INSTRUCTION } from './health-agent-date-semantics'

const CODEX_URL = 'https://chatgpt.com/backend-api/codex/responses'
const MODEL = 'gpt-5.6-terra'
const MAX_TOOL_TURNS = 8
const WEB_SEARCH_TOOL = { type: 'web_search', search_context_size: 'medium' } as const

function buildInstructions(researchPolicy: ResearchPolicy): string {
  const now = new Date()
  const dateParts = new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now)
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    dateParts.find((item) => item.type === type)?.value ?? ''
  const today = `${part('year')}-${part('month')}-${part('day')}`
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const researchInstructions = researchPolicy.enabled
    ? `Web research is available for this request with a budget of ${researchPolicy.maxSearchTurns} research turn${researchPolicy.maxSearchTurns === 1 ? '' : 's'}. Consolidate related external questions into as few searches as possible, reuse results already present in the conversation, and do not search again merely because a health-data tool returned. Every externally supported claim in the final answer must include a clickable inline citation.`
    : `Web research is intentionally unavailable for this personal-data-only request. Answer from the user's health data and stable general knowledge without claiming that you checked current external guidance.`
  return `You are OpenPulse, the built-in health assistant for Google Fitbit health data.

Today is ${today}; the user's local timezone is ${timezone}. Use civil calendar dates in that timezone.

${SLEEP_DATE_INSTRUCTION}

For every claim about the user's data, call only the narrowest relevant tools and never invent a value. Use one day for an exact fact, 7-14 days for short comparisons, about 30 days for a trend, and 60-90 days for an exploratory relationship. If observations are sparse or the result warns that evidence is thin, request a larger useful range or explain the limitation. Prefer analyze_daily_metrics for arithmetic and correlation rather than calculating from a large table yourself. Its dataset can also be presented directly: do not request the same daily range again merely to draw it. Distinguish missing data from zero. Correlation is not causation.

When a visual would materially clarify the answer, call present_health_data after the relevant tools have returned datasetId values. For a broad multi-domain health summary, weekly review, focus-area question, or comparison with external guidance, use one overview containing 2-4 relevant metrics and no other visual; do not substitute an arbitrary single-metric chart. A direct comparison or trend question should normally get one appropriate visual. Use an exact-value card for one fact, a comparison for two periods, a chart for a trend, a sleep card for one specific night when stages or the night's structure are central, a nutrition card for the composition of one day, meal, or logged food item, or a workout card for a specific workout. For comparisons, preserve explicit user wording by selecting total, average, latest, or value independently for each side; use auto when the user did not specify. Auto compares one day with a multi-day daily/nightly average, equal-length additive periods as totals, rates as averages, and state measurements as latest readings. Never total rates, percentages, weight, body fat, or BMI. Unequal totals may be displayed when explicitly requested, but they are descriptive and will not receive a change judgement. Use query_daily_metrics for a day nutrition card and query_nutrition_logs for meal or item cards. Do not use a domain card for a trend, period comparison, or broad health assessment. Normally show one block; only show two when both add distinct value, and never decorate a simple explanation unnecessarily. Only reference dataset IDs and records returned in this run; OpenPulse will compute and validate every displayed value. Still give a concise written answer after presenting data.

${researchInstructions} Prefer authoritative primary sources and current clinical guidance. Never include identifying information, private measurements, or the user's health-record dates in a search query; translate the question into a general research query. Clearly separate external evidence from what the user's own data shows.

If a tool reports source "demo", mention once that the values are sample data because no health account is connected. Be warm, precise and concise. Use plain language, concrete dates and numbers, and at most one practical suggestion when relevant. Separate what the data shows from possible interpretation. Do not diagnose; recommend professional care for concerning symptoms or persistently abnormal readings without being alarmist.`
}

type InputItem = Record<string, unknown>

interface FunctionCallItem {
  type: string
  name?: string
  arguments?: string
  call_id?: string
  [key: string]: unknown
}

interface OutputTextItem {
  type?: string
  text?: string
  annotations?: UrlCitationAnnotation[]
}

interface ResponseOutputItem extends FunctionCallItem {
  content?: OutputTextItem[]
  action?: unknown
}

function citedMessageText(item: ResponseOutputItem): string | null {
  if (item.type !== 'message' || !Array.isArray(item.content)) return null
  const output = item.content.filter((part) => part.type === 'output_text' && typeof part.text === 'string')
  if (!output.length) return null
  return output
    .map((part) => addUrlCitations(part.text ?? '', Array.isArray(part.annotations) ? part.annotations : []))
    .join('\n')
}

function toInputItems(history: ChatMessage[]): InputItem[] {
  return history.map((m) => ({
    type: 'message' as const,
    role: m.role,
    content: [{ type: m.role === 'user' ? 'input_text' : 'output_text', text: m.text }]
  }))
}

interface ActiveRun {
  sender: WebContents
  chatId: string
  runId: string
  controller: AbortController
}

const activeRuns = new Map<string, ActiveRun>()

function runKey(sender: WebContents, chatId: string): string {
  return `${sender.id}:${chatId}`
}

export function cancelChat(sender: WebContents, chatId: string, runId: string): void {
  const run = activeRuns.get(runKey(sender, chatId))
  if (run?.runId === runId) run.controller.abort(new Error('Response stopped.'))
}

export function cancelAllChats(reason = 'Response cancelled.'): void {
  for (const run of activeRuns.values()) run.controller.abort(new Error(reason))
}

function cancellationError(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error('Response cancelled.')
}

export async function runChat(
  sender: WebContents,
  chatId: string,
  runId: string,
  history: ChatMessage[]
): Promise<void> {
  const key = runKey(sender, chatId)
  if (activeRuns.has(key)) {
    if (!sender.isDestroyed()) {
      sender.send('ai:event', {
        type: 'error',
        chatId,
        runId,
        message: 'This chat already has a response in progress.'
      } satisfies AiEvent)
    }
    return
  }
  const controller = new AbortController()
  const { signal } = controller
  const latestUserText = [...history].reverse().find((message) => message.role === 'user')?.text ?? ''
  const researchPolicy = researchPolicyForRequest(latestUserText)
  const trace = new AgentTracer(chatId, runId)
  trace.emit({ type: 'run_started', model: MODEL, messages: history.length, maxTurns: MAX_TOOL_TURNS })
  trace.emit({
    type: 'research_policy',
    enabled: researchPolicy.enabled,
    maxSearchTurns: researchPolicy.maxSearchTurns,
    reason: researchPolicy.reason
  })
  let turnsUsed = 0
  let healthToolCalls = 0
  let presentationCalls = 0
  let webSearches = 0
  let researchTurnsUsed = 0
  let lastResearchModelTurn = 0
  let citationRepairAttempted = false
  const run: ActiveRun = { sender, chatId, runId, controller }
  activeRuns.set(key, run)
  const onDestroyed = (): void => controller.abort(new Error('Window closed.'))
  sender.once('destroyed', onDestroyed)

  const emit = (event: AiEvent): void => {
    if (!sender.isDestroyed()) sender.send('ai:event', event)
  }
  try {
    const authGeneration = getCodexAuthGeneration()
    const tokens = await getCodexTokens(signal)
    if (!tokens || !isCodexAuthGenerationCurrent(authGeneration)) {
      throw new Error('Not signed in. Connect ChatGPT in Settings to use the assistant.')
    }
    trace.emit({ type: 'auth_ready', accountScoped: Boolean(tokens.accountId) })
    const input: InputItem[] = toInputItems(history)
    let finalText = ''
    const datasets = new Map<string, AgentDataset>()
    const visualParts: AssistantVisualPart[] = []

    for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
      turnsUsed = turn + 1
      const finalResponseTurn = turn === MAX_TOOL_TURNS - 1
      const forceNoTools = finalResponseTurn || citationRepairAttempted
      const canUseWebResearch = webResearchAvailable(researchPolicy, researchTurnsUsed, forceNoTools)
      signal.throwIfAborted()
      if (!isCodexAuthGenerationCurrent(authGeneration)) throw new Error('ChatGPT disconnected.')
      trace.emit({
        type: 'turn_started',
        turn: turnsUsed,
        maxTurns: MAX_TOOL_TURNS,
        inputItems: input.length,
        datasets: datasets.size,
        visuals: visualParts.length,
        finalResponse: forceNoTools
      })
      const modelStartedAt = performance.now()
      const resp = await fetch(CODEX_URL, {
        method: 'POST',
        signal,
        headers: {
          authorization: `Bearer ${tokens.accessToken}`,
          'content-type': 'application/json',
          accept: 'text/event-stream',
          'OpenAI-Beta': 'responses=experimental',
          originator: 'codex_cli_rs',
          session_id: chatId,
          ...(tokens.accountId ? { 'chatgpt-account-id': tokens.accountId } : {})
        },
        body: JSON.stringify({
          model: MODEL,
          instructions: buildInstructions(researchPolicy),
          input,
          tools: [
            ...AGENT_TOOLS,
            PRESENTATION_TOOL,
            ...(canUseWebResearch ? [WEB_SEARCH_TOOL] : [])
          ],
          tool_choice: forceNoTools ? 'none' : 'auto',
          parallel_tool_calls: false,
          store: false,
          stream: true,
          include: ['reasoning.encrypted_content'],
          prompt_cache_key: chatId
        })
      })

      if (!resp.ok || !resp.body) {
        const detail = await resp.text().catch(() => '')
        if (resp.status === 401) throw new Error('ChatGPT session expired. Reconnect in Settings.')
        if (resp.status === 400 && /model.+not supported/i.test(detail)) {
          throw new Error(
            `${MODEL} is not enabled for this ChatGPT account yet. The model request was sent correctly, but the account rejected it.`
          )
        }
        throw new Error(`Codex request failed (${resp.status}): ${detail.slice(0, 300)}`)
      }

      const functionCalls: FunctionCallItem[] = []
      const continuationItems: InputItem[] = []
      let turnText = ''
      const completedMessages: string[] = []
      let citationCount = 0
      let usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number } | undefined
      let buffer = ''
      const reader = resp.body.getReader()
      const decoder = new TextDecoder()

      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const chunks = buffer.split('\n\n')
        buffer = chunks.pop() ?? ''
        for (const chunk of chunks) {
          for (const line of chunk.split('\n')) {
            if (!line.startsWith('data:')) continue
            const payload = line.slice(5).trim()
            if (!payload || payload === '[DONE]') continue
            let event: {
              type?: string
              delta?: string
              item?: ResponseOutputItem
              response?: {
                error?: { message?: string }
                usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number }
              }
            }
            try {
              event = JSON.parse(payload)
            } catch {
              continue
            }
            switch (event.type) {
              case 'response.output_item.added':
                if (event.item?.type === 'web_search_call') {
                  webSearches++
                  if (webSearches === 1) finalText = ''
                  if (lastResearchModelTurn !== turnsUsed) {
                    researchTurnsUsed++
                    lastResearchModelTurn = turnsUsed
                  }
                  const action = sanitizeWebSearchAction(event.item.action)
                  trace.emit({
                    type: 'web_search_started',
                    turn: turnsUsed,
                    researchTurn: researchTurnsUsed,
                    maxSearchTurns: researchPolicy.maxSearchTurns,
                    action: action.action,
                    ...(action.query ? { query: action.query } : {})
                  })
                  emit({
                    type: 'tool',
                    chatId,
                    runId,
                    name: 'web_search',
                    label: 'Researching the web'
                  })
                }
                break
              case 'response.output_text.delta':
                if (event.delta) {
                  turnText += event.delta
                  // Researched text is buffered until its citations can be
                  // validated. `done` still delivers the complete answer.
                  if (webSearches === 0 && !citationRepairAttempted) {
                    emit({ type: 'delta', chatId, runId, text: event.delta })
                  }
                }
                break
              case 'response.reasoning_summary_text.delta':
                emit({ type: 'reasoning', chatId, runId })
                break
              case 'response.output_item.done':
                if (event.item?.type === 'function_call') {
                  functionCalls.push(event.item)
                  continuationItems.push(event.item)
                } else if (event.item?.type === 'reasoning' || event.item?.type === 'web_search_call') {
                  continuationItems.push(event.item)
                  if (event.item.type === 'web_search_call') {
                    const action = sanitizeWebSearchAction(event.item.action)
                    trace.emit({
                      type: 'web_search_completed',
                      turn: turnsUsed,
                      researchTurn: researchTurnsUsed,
                      maxSearchTurns: researchPolicy.maxSearchTurns,
                      action: action.action,
                      ...(action.query ? { query: action.query } : {})
                    })
                  }
                } else if (event.item?.type === 'message') {
                  continuationItems.push(event.item)
                  citationCount +=
                    event.item.content?.reduce(
                      (count, part) =>
                        count +
                        (Array.isArray(part.annotations)
                          ? countValidUrlCitations(part.annotations)
                          : 0),
                      0
                    ) ?? 0
                  const messageText = citedMessageText(event.item)
                  if (messageText != null) completedMessages.push(messageText)
                }
                break
              case 'response.completed':
                if (event.response?.usage) {
                  usage = {
                    inputTokens: event.response.usage.input_tokens,
                    outputTokens: event.response.usage.output_tokens,
                    totalTokens: event.response.usage.total_tokens
                  }
                }
                break
              case 'response.failed':
                throw new Error(event.response?.error?.message ?? 'The model reported a failure.')
            }
          }
        }
      }

      trace.emit({
        type: 'model_responded',
        turn: turnsUsed,
        durationMs: performance.now() - modelStartedAt,
        functionCalls: functionCalls.length,
        textChars: completedMessages.reduce((count, message) => count + message.length, 0) || turnText.length,
        citations: citationCount,
        ...(usage ? { usage } : {})
      })

      const resolvedTurnText = completedMessages.length ? completedMessages.join('\n') : turnText
      signal.throwIfAborted()
      if (!isCodexAuthGenerationCurrent(authGeneration)) throw new Error('ChatGPT disconnected.')

      if (functionCalls.length === 0) {
        const researchAction = researchCompletionAction(
          webSearches,
          citationCount,
          citationRepairAttempted,
          !finalResponseTurn
        )
        if (researchAction === 'repair-citations') {
          citationRepairAttempted = true
          trace.emit({ type: 'citation_repair', turn: turnsUsed, outcome: 'started' })
          input.push(...continuationItems, {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text: CITATION_REPAIR_INSTRUCTION }]
          })
          finalText = ''
          continue
        }
        if (researchAction === 'refuse-uncited') {
          trace.emit({ type: 'citation_repair', turn: turnsUsed, outcome: 'failed' })
          finalText = UNCITED_RESEARCH_MESSAGE
        } else {
          finalText += resolvedTurnText
        }
        if (visualParts.length === 0) {
          let automaticParts: AssistantVisualPart[] = []
          const fallbackStartedAt = performance.now()
          try {
            automaticParts = resolveAutomaticPresentation(latestUserText, datasets)
          } catch (error) {
            trace.emit({
              type: 'tool_failed',
              turn: turnsUsed,
              name: 'automatic_presentation',
              callId: 'fallback',
              durationMs: performance.now() - fallbackStartedAt,
              message: error instanceof Error ? error.message : String(error)
            })
          }
          visualParts.push(...automaticParts)
          if (automaticParts.length) {
            trace.emit({
              type: 'presentation_resolved',
              turn: turnsUsed,
              requested: 1,
              displayed: automaticParts.length,
              totalVisuals: visualParts.length,
              visualTypes: automaticParts.map((part) => part.type),
              source: 'fallback'
            })
          }
        }
        trace.emit({
          type: 'run_completed',
          turns: turnsUsed,
          healthTools: healthToolCalls,
          presentationCalls,
          webSearches,
          textChars: finalText.length,
          visuals: visualParts.length
        })
        emit({ type: 'done', chatId, runId, text: finalText, parts: visualParts })
        return
      }

      // Tool-call turns are planning steps. Once research has started, keep
      // any prose from those intermediate turns out of the final answer so
      // only the citation-validated synthesis is shown.
      if (webSearches === 0) finalText += resolvedTurnText
      input.push(...continuationItems)
      for (const call of functionCalls) {
        const name = call.name ?? ''
        const callId = call.call_id
        if (!callId) throw new Error(`Tool call ${name || '(unknown)'} did not include a call ID.`)
        emit({
          type: 'tool',
          chatId,
          runId,
          name,
          label: name === PRESENTATION_TOOL.name ? 'Preparing visuals' : AGENT_TOOL_LABELS[name] ?? `Running ${name}`
        })
        let args: Record<string, unknown> = {}
        try {
          args = call.arguments ? JSON.parse(call.arguments) : {}
        } catch {
          // The tool returns a structured validation error for malformed input.
        }
        trace.emit({
          type: 'tool_started',
          turn: turnsUsed,
          name,
          callId,
          arguments: summarizeToolArguments(name, args)
        })
        const toolStartedAt = performance.now()
        let output: string
        let failed = false
        try {
          if (name === PRESENTATION_TOOL.name) {
            presentationCalls++
            const available = Math.max(0, 2 - visualParts.length)
            const resolved = resolvePresentation(args, datasets).slice(0, available)
            visualParts.push(...resolved)
            const requested = ['overviews', 'metricCards', 'comparisons', 'charts', 'sleepCards', 'nutritionCards', 'workouts'].reduce(
              (total, key) => total + (Array.isArray(args[key]) ? args[key].length : 0),
              0
            )
            trace.emit({
              type: 'presentation_resolved',
              turn: turnsUsed,
              requested,
              displayed: resolved.length,
              totalVisuals: visualParts.length,
              visualTypes: resolved.map((part) => part.type),
              source: 'model'
            })
            output = JSON.stringify({ displayed: resolved.length })
          } else {
            healthToolCalls++
            output = await runHealthAgentTool(name, args, signal)
            const parsed = JSON.parse(output) as unknown
            const data = parsed != null && typeof parsed === 'object' && !Array.isArray(parsed)
              ? (parsed as Record<string, unknown>)
              : null
            if (data && !('error' in data)) {
              datasets.set(callId, { tool: name, data })
              output = JSON.stringify({ ...healthAgentModelData(name, data), datasetId: callId })
            }
          }
        } catch (error) {
          if (signal.aborted) throw cancellationError(signal)
          failed = true
          const message = error instanceof Error ? error.message : String(error)
          trace.emit({
            type: 'tool_failed',
            turn: turnsUsed,
            name,
            callId,
            durationMs: performance.now() - toolStartedAt,
            message
          })
          output = JSON.stringify({ error: message })
        }
        if (!failed) {
          let parsedOutput: unknown = null
          try {
            parsedOutput = JSON.parse(output)
          } catch {
            // Tool results are expected to be JSON; the trace still records their size.
          }
          trace.emit({
            type: 'tool_completed',
            turn: turnsUsed,
            name,
            callId,
            durationMs: performance.now() - toolStartedAt,
            bytes: Buffer.byteLength(output, 'utf8'),
            result:
              name === PRESENTATION_TOOL.name
                ? {
                    displayed:
                      parsedOutput != null && typeof parsedOutput === 'object' && !Array.isArray(parsedOutput)
                        ? (parsedOutput as Record<string, unknown>).displayed
                        : undefined
                  }
                : summarizeToolResult(name, parsedOutput)
          })
        }
        input.push({
          type: 'function_call_output',
          call_id: callId,
          output
        })
      }
    }
    trace.emit({
      type: 'budget_exhausted',
      turns: turnsUsed,
      maxTurns: MAX_TOOL_TURNS,
      healthTools: healthToolCalls,
      presentationCalls,
      webSearches,
      textChars: finalText.length,
      visuals: visualParts.length
    })
    emit({
      type: 'done',
      chatId,
      runId,
      text: finalText || 'I hit the tool-call limit before finishing — try a narrower question.',
      parts: visualParts
    })
  } catch (err) {
    const error = signal.aborted ? cancellationError(signal) : err
    trace.failure(error, signal.aborted)
    emit({ type: 'error', chatId, runId, message: error instanceof Error ? error.message : String(error) })
  } finally {
    sender.removeListener('destroyed', onDestroyed)
    if (activeRuns.get(key) === run) activeRuns.delete(key)
  }
}
