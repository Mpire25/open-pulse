import { test } from 'bun:test'
import { resolve } from 'node:path'

test('catalog reasoning levels survive settings persistence', async () => {
  const process = Bun.spawn([Bun.which('bun') ?? 'bun', 'test', resolve(import.meta.dir, 'fixtures/assistant-settings-store-harness.ts')], {
    stdout: 'pipe', stderr: 'pipe'
  })
  const [code, stdout, stderr] = await Promise.all([
    process.exited, new Response(process.stdout).text(), new Response(process.stderr).text()
  ])
  if (code !== 0) throw new Error(`Assistant store harness failed (${code}).\n${stdout}\n${stderr}`)
})
