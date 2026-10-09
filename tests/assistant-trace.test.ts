import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  configureAssistantTrace,
  startAssistantRunTrace,
  traceArgs,
  traceToolResult
} from '../src/main/assistant-trace'
import { dataCoverageContext } from '../src/main/health-agent-coverage'

let dir: string | null = null

afterEach(() => {
  configureAssistantTrace(null)
  if (dir) rmSync(dir, { recursive: true, force: true })
  dir = null
})

describe('assistant run trace', () => {
  test('keeps dates, enum values and identifiers but replaces free text with its length', () => {
    expect(traceArgs({
      metrics: ['weightKg', 'caloriesOut'],
      startDate: '2026-08-08',
      title: 'Weight gain since August',
      days: 7
    })).toEqual({
      metrics: ['weightKg', 'caloriesOut'],
      startDate: '2026-08-08',
      title: '[text:24]',
      days: 7
    })
  })

  test('summarises tool results without health values', () => {
    const output = JSON.stringify({
      requestedRange: { start: '2026-08-08', end: '2026-10-08' },
      observations: { weightKg: 27 },
      days: { '2026-10-08': { weightKg: 76.2 } },
      nights: [{ minutesAsleep: 420 }],
      datasetId: 'call-1'
    })
    const result = traceToolResult(output)
    expect(result).toEqual({
      chars: output.length,
      requestedRange: { start: '2026-08-08', end: '2026-10-08' },
      observations: { weightKg: 27 },
      daysCount: 1,
      nightsCount: 1,
      datasetId: 'call-1'
    })
    expect(JSON.stringify(result)).not.toContain('76.2')
    expect(traceToolResult(JSON.stringify({ error: 'This tool accepts at most 120 days per request.' })))
      .toMatchObject({ error: 'This tool accepts at most 120 days per request.' })
  })

  test('writes one line per run with requests, tool calls and outcome, never research text', () => {
    dir = mkdtempSync(join(tmpdir(), 'openpulse-trace-'))
    const file = join(dir, 'trace.jsonl')
    configureAssistantTrace(file)

    const trace = startAssistantRunTrace({
      chatId: 'chat',
      runId: 'run',
      model: 'test-model',
      reasoningEffort: 'high',
      historyMessages: 1
    })
    const request = trace.startRequest({ turn: 0, tools: ['query_daily_metrics'], toolChoice: 'auto', inputItems: 2 })
    request.firstByte()
    request.finish({
      usage: { inputTokens: 1200, cachedTokens: 1024, outputTokens: 80, reasoningTokens: 40 },
      functionCalls: ['query_daily_metrics', 'research_web'],
      textChars: 0
    })
    trace.toolCall({
      turn: 0,
      name: 'research_web',
      args: { query: 'Is 76 kg healthy for my height?' },
      startedAt: Date.now(),
      output: JSON.stringify({ searched: true, research: 'secret findings' })
    })
    trace.finish('completed')
    trace.finish('error', 'ignored after the first finish')

    const lines = readFileSync(file, 'utf8').trim().split('\n')
    expect(lines).toHaveLength(1)
    const record = JSON.parse(lines[0])
    expect(record).toMatchObject({
      chatId: 'chat',
      runId: 'run',
      model: 'test-model',
      reasoningEffort: 'high',
      outcome: 'completed',
      requests: [{
        turn: 0,
        toolChoice: 'auto',
        usage: { cachedTokens: 1024 },
        functionCalls: ['query_daily_metrics', 'research_web']
      }],
      toolCalls: [{ name: 'research_web', args: { query: '[text:31]' }, result: { searched: true } }]
    })
    expect(lines[0]).not.toContain('76 kg')
    expect(lines[0]).not.toContain('secret findings')
  })

  test('does nothing until a trace file is configured', () => {
    const trace = startAssistantRunTrace({
      chatId: 'chat',
      runId: 'run',
      model: 'test-model',
      reasoningEffort: 'auto',
      historyMessages: 1
    })
    expect(() => trace.finish('completed')).not.toThrow()
  })
})

describe('assistant data coverage', () => {
  test('lists cached metrics in a stable order and says the history extends beyond them', () => {
    const text = dataCoverageContext({
      caloriesOut: { days: 62, first: '2026-08-08', last: '2026-10-08' },
      weightKg: { days: 1, first: '2026-10-08', last: '2026-10-08' }
    }, '2026-10-08')
    expect(text).toContain('Today is 2026-10-08.')
    expect(text).toContain('Query the relevant range before concluding that data is unavailable.')
    expect(text.indexOf('caloriesOut: 62 days')).toBeLessThan(text.indexOf('weightKg: 1 day,'))
  })

  test('still describes the history when nothing is cached', () => {
    expect(dataCoverageContext({}, '2026-10-08')).toContain('No daily values are cached locally yet.')
  })
})
