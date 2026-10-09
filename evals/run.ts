// Assistant evals: asks the real assistant a fixed set of questions about a
// deterministic health history and scores the answers. See evals/README.md.

import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { DEFAULT_ASSISTANT, type AssistantSettings } from '../src/shared/types'
import { buildCases, CATEGORIES, type EvalCase } from './cases'
import { pinEvalNow } from './fixture'
import { appAssistantSettings, hasSessionFile, loadAssistant, sessionDir } from './runtime'
import { pool, recordFromRun, runCase, score, type CaseResult, type ResultsFile } from './runner'

const REPO = resolve(import.meta.dir, '..')
const RESULTS_DIR = join(REPO, 'evals', 'results')

const { values: options } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    cases: { type: 'string' },
    repeat: { type: 'string', default: '1' },
    concurrency: { type: 'string', default: '4' },
    ref: { type: 'string' },
    model: { type: 'string' },
    effort: { type: 'string' },
    label: { type: 'string' },
    'sign-in': { type: 'boolean', default: false },
    'sign-out': { type: 'boolean', default: false },
    compare: { type: 'string', multiple: true },
    rescore: { type: 'string' },
    verbose: { type: 'boolean', short: 'v', default: false },
    help: { type: 'boolean', short: 'h', default: false }
  }
})

const HELP = `Usage: bun run eval [options]

  --sign-in            Sign the evals in to ChatGPT (once; opens your browser)
  --sign-out           Revoke and delete the evals' ChatGPT session
  --cases <list>       Comma-separated case ids or categories (${CATEGORIES.join(', ')})
  --repeat <n>         Run each case n times (default 1)
  --concurrency <n>    Cases run at once (default 4)
  --ref <git-ref>      Evaluate another version, e.g. a commit or branch
  --model <slug>       Model (default: the model set in the app)
  --effort <level>     Reasoning effort (default: the effort set in the app)
  --label <name>       Name for the results file
  --compare <a> <b>    Compare two results files (pass --compare twice)
  --rescore <file>     Score a saved results file again with the current checks
  -v, --verbose        Print every answer
`

// ---------------------------------------------------------------------------
// Reporting

function median(values: number[]): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`
}

interface Summary {
  passRate: number
  score: number
  medianMs: number
  medianFirstTextMs: number
  modelRequests: number
  tokens: number
}

function summarise(cases: CaseResult[]): Summary {
  const runs = cases.flatMap((result) => result.runs)
  return {
    passRate: runs.filter((run) => run.passed).length / (runs.length || 1),
    score: runs.reduce((sum, run) => sum + run.score, 0) / (runs.length || 1),
    medianMs: median(runs.map((run) => run.totalMs)),
    medianFirstTextMs: median(runs.flatMap((run) => (run.firstTextMs == null ? [] : [run.firstTextMs]))),
    modelRequests: runs.reduce((sum, run) => sum + run.modelRequests, 0) / (runs.length || 1),
    tokens: runs.reduce((sum, run) => sum + run.inputTokens + run.outputTokens, 0) / (runs.length || 1)
  }
}

function printResults(results: ResultsFile, verbose: boolean): void {
  console.log(`\n${results.label} — ${results.model} (${results.reasoningEffort}), ${results.commit.slice(0, 7)}\n`)
  for (const result of results.cases) {
    const passes = result.runs.filter((run) => run.passed).length
    const mark = passes === result.runs.length ? '✓' : passes === 0 ? '✗' : '~'
    const time = median(result.runs.map((run) => run.totalMs))
    const requests = median(result.runs.map((run) => run.modelRequests))
    console.log(
      `${mark} ${result.id.padEnd(28)} ${`${passes}/${result.runs.length}`.padStart(5)}  ` +
        `${seconds(time).padStart(7)}  ${String(requests).padStart(2)} req`
    )
    for (const run of result.runs) {
      const failed = run.checks.filter((check) => !check.passed)
      for (const check of failed) console.log(`    ${check.critical ? '✗' : '·'} ${check.name}`)
      if (run.error) console.log(`    ! ${run.error}`)
      if (verbose) console.log(`    ${run.text.replace(/\n+/g, '\n    ')}\n`)
    }
  }
  console.log('')
  for (const category of CATEGORIES) {
    const cases = results.cases.filter((result) => result.category === category)
    if (!cases.length) continue
    const summary = summarise(cases)
    console.log(
      `${category.padEnd(14)} pass ${percent(summary.passRate).padStart(4)}  score ${percent(summary.score).padStart(4)}  ` +
        `median ${seconds(summary.medianMs).padStart(6)}  first text ${seconds(summary.medianFirstTextMs).padStart(6)}`
    )
  }
  const total = summarise(results.cases)
  console.log(
    `${'overall'.padEnd(14)} pass ${percent(total.passRate).padStart(4)}  score ${percent(total.score).padStart(4)}  ` +
      `median ${seconds(total.medianMs).padStart(6)}  first text ${seconds(total.medianFirstTextMs).padStart(6)}  ` +
      `${total.modelRequests.toFixed(1)} req/run  ${Math.round(total.tokens).toLocaleString('en-GB')} tokens/run`
  )
}

function compare(paths: string[]): void {
  const [before, after] = paths.map((path) => JSON.parse(readFileSync(path, 'utf8')) as ResultsFile)
  console.log(`\nbefore: ${before.label} (${before.commit.slice(0, 7)}, ${before.model} ${before.reasoningEffort})`)
  console.log(`after:  ${after.label} (${after.commit.slice(0, 7)}, ${after.model} ${after.reasoningEffort})\n`)
  const ids = [...new Set([...before.cases, ...after.cases].map((result) => result.id))]
  for (const id of ids) {
    const a = before.cases.find((result) => result.id === id)
    const b = after.cases.find((result) => result.id === id)
    const rate = (result?: CaseResult): string =>
      result ? `${result.runs.filter((run) => run.passed).length}/${result.runs.length}` : '—'
    const time = (result?: CaseResult): string => (result ? seconds(median(result.runs.map((run) => run.totalMs))) : '—')
    console.log(`${id.padEnd(28)} ${rate(a).padStart(5)} → ${rate(b).padEnd(5)}  ${time(a).padStart(7)} → ${time(b)}`)
  }
  const common = ids.filter((id) => before.cases.some((c) => c.id === id) && after.cases.some((c) => c.id === id))
  const a = summarise(before.cases.filter((result) => common.includes(result.id)))
  const b = summarise(after.cases.filter((result) => common.includes(result.id)))
  console.log(
    `\n${'pass rate'.padEnd(18)} ${percent(a.passRate)} → ${percent(b.passRate)}\n` +
      `${'check score'.padEnd(18)} ${percent(a.score)} → ${percent(b.score)}\n` +
      `${'median time'.padEnd(18)} ${seconds(a.medianMs)} → ${seconds(b.medianMs)}\n` +
      `${'median first text'.padEnd(18)} ${seconds(a.medianFirstTextMs)} → ${seconds(b.medianFirstTextMs)}\n` +
      `${'requests per run'.padEnd(18)} ${a.modelRequests.toFixed(1)} → ${b.modelRequests.toFixed(1)}\n` +
      `${'tokens per run'.padEnd(18)} ${Math.round(a.tokens).toLocaleString('en-GB')} → ${Math.round(b.tokens).toLocaleString('en-GB')}`
  )
}

/** Saves a re-scored copy next to the original; answers are not re-generated. */
function rescore(path: string, verbose: boolean): void {
  const results = JSON.parse(readFileSync(path, 'utf8')) as ResultsFile
  // Judge the saved answers against the day they were given, not today.
  pinEvalNow(new Date(results.startedAt))
  const cases = new Map(buildCases().map((evalCase) => [evalCase.id, evalCase]))
  results.cases = results.cases.flatMap((result) => {
    const evalCase = cases.get(result.id)
    return evalCase ? [{ ...result, runs: result.runs.map((run) => ({ ...score(evalCase, recordFromRun(run)), requests: run.requests })) }] : []
  })
  const file = path.replace(/(?:-rescored)?\.json$/, '-rescored.json')
  writeFileSync(file, `${JSON.stringify(results, null, 2)}\n`)
  printResults(results, verbose)
  console.log(`\nSaved ${file}`)
}

// ---------------------------------------------------------------------------
// Checkouts

async function git(args: string[], cwd = REPO): Promise<string> {
  const child = Bun.spawn(['git', ...args], { cwd, stdout: 'pipe', stderr: 'pipe' })
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text()
  ])
  if (code !== 0) throw new Error(`git ${args.join(' ')} failed: ${stderr.trim()}`)
  return stdout.trim()
}

/** A temporary detached worktree of `ref`, sharing this checkout's node_modules. */
async function checkout(ref: string): Promise<{ root: string; remove: () => Promise<void> }> {
  const root = mkdtempSync(join(tmpdir(), 'openpulse-eval-'))
  rmSync(root, { recursive: true, force: true })
  await git(['worktree', 'add', '--detach', root, ref])
  symlinkSync(join(REPO, 'node_modules'), join(root, 'node_modules'))
  return {
    root,
    remove: async () => {
      await git(['worktree', 'remove', '--force', root]).catch(() => rmSync(root, { recursive: true, force: true }))
    }
  }
}

// ---------------------------------------------------------------------------

function selectCases(filter?: string): EvalCase[] {
  const all = buildCases()
  if (!filter) return all
  const wanted = new Set(filter.split(',').map((item) => item.trim()).filter(Boolean))
  const selected = all.filter((evalCase) => wanted.has(evalCase.id) || wanted.has(evalCase.category))
  if (!selected.length) throw new Error(`No cases match "${filter}".`)
  return selected
}

async function main(): Promise<void> {
  if (options.help) {
    console.log(HELP)
    return
  }
  if (options.compare) {
    if (options.compare.length !== 2) throw new Error('Pass --compare twice: --compare before.json --compare after.json')
    compare(options.compare)
    return
  }
  if (options.rescore) {
    rescore(options.rescore, options.verbose ?? false)
    return
  }

  const saved = appAssistantSettings()
  const assistantSettings: AssistantSettings = {
    model: options.model ?? saved.model ?? DEFAULT_ASSISTANT.model,
    reasoningEffort: (options.effort ?? saved.reasoningEffort ?? DEFAULT_ASSISTANT.reasoningEffort) as AssistantSettings['reasoningEffort']
  }

  const ref = options.ref ?? 'HEAD'
  const target = options.ref ? await checkout(options.ref) : { root: REPO, remove: async () => {} }
  try {
    const assistant = await loadAssistant(target.root, assistantSettings)

    if (options['sign-out']) {
      const result = await assistant.disconnectCodex()
      rmSync(sessionDir(), { recursive: true, force: true })
      console.log(result.warning ?? 'Signed out and deleted the eval session.')
      return
    }
    if (options['sign-in'] || !hasSessionFile()) {
      if (!options['sign-in']) console.log('The evals need their own ChatGPT sign-in first.')
      const status = await assistant.connectCodex()
      console.log(status.connected ? `Signed in as ${status.email ?? 'your ChatGPT account'}.` : 'Sign-in did not enable ChatGPT plan usage.')
      if (options['sign-in']) return
    }
    if (!assistant.getCodexStatus().connected) {
      throw new Error('The eval ChatGPT session is not usable. Run: bun run eval --sign-in')
    }

    const startedAt = new Date()
    pinEvalNow(startedAt)
    const cases = selectCases(options.cases)
    const repeat = Math.max(1, Number(options.repeat) || 1)
    const commit = await git(['rev-parse', 'HEAD'], target.root)
    const results: ResultsFile = {
      label: options.label ?? (options.ref ? options.ref.replace(/[^\w.-]+/g, '-') : 'current'),
      ref,
      commit,
      model: assistantSettings.model,
      reasoningEffort: assistantSettings.reasoningEffort ?? 'auto',
      startedAt: startedAt.toISOString(),
      repeat,
      cases: cases.map((evalCase) => ({ id: evalCase.id, category: evalCase.category, runs: [] }))
    }

    const jobs = cases.flatMap((evalCase) => Array.from({ length: repeat }, (_, attempt) => ({ evalCase, attempt })))
    console.log(`Running ${jobs.length} conversations against ${results.label} (${commit.slice(0, 7)}) with ${results.model} (${results.reasoningEffort})…`)
    let finished = 0
    await pool(jobs, Number(options.concurrency) || 4, async ({ evalCase, attempt }) => {
      const record = await runCase(assistant, evalCase, attempt)
      const run = score(evalCase, record)
      results.cases.find((result) => result.id === evalCase.id)!.runs.push(run)
      finished++
      console.log(`  [${finished}/${jobs.length}] ${run.passed ? '✓' : '✗'} ${evalCase.id} (${seconds(run.totalMs)})`)
    })

    mkdirSync(RESULTS_DIR, { recursive: true })
    const file = join(RESULTS_DIR, `${results.startedAt.replace(/[:.]/g, '-')}-${results.label}.json`)
    writeFileSync(file, `${JSON.stringify(results, null, 2)}\n`)
    printResults(results, options.verbose ?? false)
    console.log(`\nSaved ${file}`)
  } finally {
    await target.remove()
  }
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
)
