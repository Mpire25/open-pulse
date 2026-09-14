import { test } from 'bun:test'
import { resolve } from 'node:path'

test('sleep fetch, pagination and legacy archive integration', async () => {
  const child = Bun.spawn([Bun.which('bun') ?? 'bun', 'test', resolve(import.meta.dir, 'fixtures/health-service-sleep-harness.ts')], {
    cwd: resolve(import.meta.dir, '..'), stdout: 'pipe', stderr: 'pipe'
  })
  const [code, out, err] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
  if (code !== 0) throw new Error(`Sleep integration failed (${code}).\n${out}\n${err}`)
}, 15_000)
