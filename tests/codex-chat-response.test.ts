import { test } from 'bun:test'
import { resolve } from 'node:path'

test('combined response orchestration, correction, interruption and retrieval', async () => {
  const child = Bun.spawn(['bun', 'test', resolve(import.meta.dir, 'fixtures/codex-chat-response-harness.ts')], {
    stdout: 'pipe', stderr: 'pipe'
  })
  const [code, stdout, stderr] = await Promise.all([
    child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()
  ])
  if (code !== 0) throw new Error(`Combined response harness failed (${code}).\n${stdout}\n${stderr}`)
}, 15_000)
