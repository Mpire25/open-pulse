// Running and scoring eval conversations. The CLI is evals/run.ts.

import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import type { WebContents } from 'electron'
import type { AiEvent, AssistantVisualPart } from '../src/shared/types'
import type { EvalCase } from './cases'
import type { ModelRequest, RunRecord } from './checks'
import { runContext, type AssistantUnderTest, type RunContext } from './runtime'

export const RUN_TIMEOUT_MS = 6 * 60_000

// ---------------------------------------------------------------------------
// Results

export interface CheckResult {
  name: string
  critical: boolean
  passed: boolean
}

export interface CaseRun {
  passed: boolean
  score: number
  checks: CheckResult[]
  text: string
  outcome: RunRecord['outcome']
  error?: string
  totalMs: number
  firstTextMs?: number
  modelRequests: number
  researchRequests: number
  healthCalls: RunRecord['healthCalls']
  toolCalls: string[]
  inputTokens: number
  cachedTokens: number
  outputTokens: number
  reasoningTokens: number
  visuals: string[]
  /**
   * Started after the local date changed during the run: the assistant's
   * "today" no longer matches the fixture's, so the result is unreliable.
   */
  afterMidnight?: boolean
  /** The most health data any of the run's requests carried, in characters. */
  dataChars?: number
  /** Per-request detail; absent in results saved before it was recorded. */
  requests?: Array<Omit<ModelRequest, 'startedAt'>>
}

export interface CaseResult {
  id: string
  category: string
  runs: CaseRun[]
}

export interface ResultsFile {
  label: string
  ref: string
  commit: string
  model: string
  reasoningEffort: string
  startedAt: string
  repeat: number
  cases: CaseResult[]
}

export function score(evalCase: EvalCase, record: RunRecord): CaseRun {
  const checks = evalCase.checks.map((check) => {
    let passed = false
    try {
      passed = check.run(record)
    } catch {
      passed = false
    }
    return { name: check.name, critical: check.critical, passed }
  })
  const sum = (pick: (request: RunRecord['modelRequests'][number]) => number | undefined): number =>
    record.modelRequests.reduce((total, request) => total + (pick(request) ?? 0), 0)
  return {
    passed: checks.every((check) => check.passed || !check.critical),
    score: checks.filter((check) => check.passed).length / checks.length,
    checks,
    text: record.text,
    outcome: record.outcome,
    error: record.error,
    totalMs: record.totalMs,
    firstTextMs: record.firstTextMs,
    modelRequests: record.modelRequests.filter((request) => request.kind === 'agent').length,
    researchRequests: record.modelRequests.filter((request) => request.kind === 'research').length,
    healthCalls: record.healthCalls,
    toolCalls: record.modelRequests.flatMap((request) => request.functionCalls),
    inputTokens: sum((request) => request.inputTokens),
    cachedTokens: sum((request) => request.cachedTokens),
    outputTokens: sum((request) => request.outputTokens),
    reasoningTokens: sum((request) => request.reasoningTokens),
    visuals: record.parts.map((part) => (part as { type?: string }).type ?? 'visual'),
    dataChars: Math.max(0, ...record.modelRequests.filter((request) => request.kind === 'agent').map((request) => request.dataChars ?? 0)),
    requests: record.modelRequests.map(({ startedAt: _startedAt, ...request }) => request)
  }
}

/** Rebuilds what a saved run recorded, so it can be scored again with updated checks. */
export function recordFromRun(run: CaseRun): RunRecord {
  // Older results kept only totals: rebuild the request count and put the token totals on the first.
  const requests: ModelRequest[] = run.requests?.map((request) => ({ ...request, startedAt: 0 })) ?? [
    ...Array.from({ length: run.modelRequests }, () => ({ kind: 'agent' as const, tools: [], startedAt: 0, functionCalls: [] })),
    ...Array.from({ length: run.researchRequests }, () => ({ kind: 'research' as const, tools: [], startedAt: 0, functionCalls: [] }))
  ].map((request, index) => index === 0
    ? { ...request, inputTokens: run.inputTokens, cachedTokens: run.cachedTokens, outputTokens: run.outputTokens, reasoningTokens: run.reasoningTokens }
    : request)
  return {
    text: run.text,
    parts: run.visuals.map((type) => ({ type }) as unknown as RunRecord['parts'][number]),
    outcome: run.outcome,
    error: run.error,
    healthCalls: run.healthCalls,
    modelRequests: requests,
    toolEvents: run.toolCalls,
    totalMs: run.totalMs,
    firstTextMs: run.firstTextMs
  }
}

// ---------------------------------------------------------------------------
// Running one case

class EvalSender extends EventEmitter {
  readonly id = Math.floor(Math.random() * 1e9)
  readonly events: AiEvent[] = []
  isDestroyed(): boolean {
    return false
  }
  send(channel: string, event: AiEvent): void {
    if (channel === 'ai:event') this.events.push(event)
  }
}

export async function runCase(assistant: AssistantUnderTest, evalCase: EvalCase, attempt: number): Promise<RunRecord> {
  const sender = new EvalSender()
  const chatId = `eval-${evalCase.id}-${attempt}-${randomUUID().slice(0, 8)}`
  const runId = randomUUID()
  const context: RunContext = { healthCalls: [], modelRequests: [], recordings: [] }
  const startedAt = Date.now()
  let firstTextMs: number | undefined
  sender.send = (channel: string, event: AiEvent) => {
    if (channel !== 'ai:event') return
    if (event.type === 'delta' && firstTextMs === undefined) firstTextMs = Date.now() - startedAt
    sender.events.push(event)
  }
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    assistant.cancelChat(sender as unknown as WebContents, chatId, runId)
  }, RUN_TIMEOUT_MS)
  try {
    await runContext.run(context, () =>
      assistant.runChat(sender as unknown as WebContents, chatId, runId, evalCase.history)
    )
  } catch (error) {
    sender.events.push({ type: 'error', chatId, runId, message: error instanceof Error ? error.message : String(error) })
  } finally {
    clearTimeout(timer)
  }
  // Usage arrives in each stream's last event; wait for the recorder to read it.
  await Promise.race([
    Promise.allSettled(context.recordings),
    new Promise((resolve) => setTimeout(resolve, 10_000))
  ])
  const done = sender.events.find((event) => event.type === 'done')
  const failure = sender.events.find((event) => event.type === 'error' || event.type === 'interrupted')
  return {
    text: done?.type === 'done' ? done.text : '',
    parts: done?.type === 'done' ? (done.parts as AssistantVisualPart[]) : [],
    outcome: done?.type === 'done' ? done.outcome : timedOut ? 'timeout' : failure?.type === 'interrupted' ? 'interrupted' : 'error',
    error: failure && 'message' in failure ? failure.message : undefined,
    healthCalls: context.healthCalls,
    modelRequests: context.modelRequests,
    toolEvents: sender.events.flatMap((event) => (event.type === 'tool' ? [event.name] : [])),
    totalMs: Date.now() - startedAt,
    firstTextMs
  }
}

export async function pool<T>(items: T[], limit: number, work: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items]
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(limit, queue.length)) }, async () => {
      for (let item = queue.shift(); item !== undefined; item = queue.shift()) await work(item)
    })
  )
}
