import { test } from 'bun:test'
import { resolve } from 'node:path'
for (const mode of ['unavailable', 'encrypt', 'decrypt']) {
  test(`credential storage boundary: ${mode}`, async () => {
    const process = Bun.spawn(
      [
        Bun.which('bun') ?? 'bun',
        'test',
        resolve(import.meta.dir, 'fixtures/credential-storage-harness.ts')
      ],
      {
        env: { ...Bun.env, OPENPULSE_TEST_STORAGE_MODE: mode },
        stdout: 'pipe',
        stderr: 'pipe'
      }
    )
    const [code, stdout, stderr] = await Promise.all([
      process.exited,
      new Response(process.stdout).text(),
      new Response(process.stderr).text()
    ])
    if (code !== 0)
      throw new Error(`Storage harness failed (${code}).\n${stdout}\n${stderr}`)
  })
}
