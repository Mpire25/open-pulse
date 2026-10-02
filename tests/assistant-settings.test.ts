import { test } from 'bun:test'
import { resolve } from 'node:path'
test('assistant settings connection controls', async () => {
  const process = Bun.spawn([Bun.which('bun') ?? 'bun', 'test', resolve(import.meta.dir, 'fixtures/assistant-settings-harness.tsx')], { stdout: 'pipe', stderr: 'pipe' })
  const [code, stdout, stderr] = await Promise.all([process.exited, new Response(process.stdout).text(), new Response(process.stderr).text()])
  if (code !== 0) throw new Error(`Settings harness failed (${code}).\n${stdout}\n${stderr}`)
}, 15_000)
