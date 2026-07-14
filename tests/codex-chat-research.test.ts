import { test } from 'bun:test'
import { resolve } from 'node:path'

test('brokered Codex research orchestration', async () => {
  const harness = resolve(import.meta.dir, 'fixtures/codex-chat-research-harness.ts')
  const process = Bun.spawn([Bun.which('bun') ?? 'bun', 'test', harness], {
    cwd: resolve(import.meta.dir, '..'),
    stdout: 'pipe',
    stderr: 'pipe'
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text()
  ])
  if (exitCode !== 0) {
    throw new Error(`Research harness failed (${exitCode}).\n${stdout}\n${stderr}`)
  }
}, 15_000)
