import { test } from 'bun:test'
import { resolve } from 'node:path'

test('chat naming discovers account models without reopening credential storage', async () => {
  const process = Bun.spawn([Bun.which('bun') ?? 'bun', 'test', resolve(import.meta.dir, 'fixtures/chat-title-models-harness.ts')], {
    cwd: resolve(import.meta.dir, '..'), stdout: 'pipe', stderr: 'pipe'
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited, new Response(process.stdout).text(), new Response(process.stderr).text()
  ])
  if (exitCode !== 0) throw new Error(`Chat naming model harness failed (${exitCode}).\n${stdout}\n${stderr}`)
})
