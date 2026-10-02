import { test } from 'bun:test'
import { resolve } from 'node:path'
test('ChatGPT auth, migration and catalog lifecycle', async () => {
  const process = Bun.spawn(
    [
      Bun.which('bun') ?? 'bun',
      'test',
      resolve(import.meta.dir, 'fixtures/chatgpt-auth-harness.ts')
    ],
    { stdout: 'pipe', stderr: 'pipe' }
  )
  const [code, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text()
  ])
  if (code !== 0)
    throw new Error(`Auth harness failed (${code}).\n${stdout}\n${stderr}`)
}, 20_000)
