import { test } from 'bun:test'
import { resolve } from 'node:path'

test('health context archive reads, partial failures and cancellation', async () => {
  const child = Bun.spawn(['bun', 'test', resolve(import.meta.dir, 'fixtures/health-agent-table-harness.ts')], {
    stdout: 'pipe', stderr: 'pipe'
  })
  const [code, stdout, stderr] = await Promise.all([
    child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()
  ])
  if (code !== 0) throw new Error(`Health table harness failed (${code}).\n${stdout}\n${stderr}`)
})
