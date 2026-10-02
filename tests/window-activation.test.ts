import { expect, test } from 'bun:test'
import { EventEmitter } from 'node:events'
import { installWindowActivation } from '../src/main/window-activation'

test('a second launch waits for readiness, then recreates or restores and focuses the window', async () => {
  const app = new EventEmitter()
  let ready!: () => void
  const readiness = new Promise<void>((resolve) => { ready = resolve })
  Object.assign(app, { whenReady: () => readiness })
  const actions: string[] = []
  let window: ReturnType<typeof makeWindow> | null = null
  let minimized = false
  function makeWindow() {
    actions.push('create')
    return {
      isMinimized: () => minimized,
      restore: () => { actions.push('restore'); minimized = false },
      show: () => { actions.push('show') },
      focus: () => { actions.push('focus') }
    }
  }
  installWindowActivation(app as EventEmitter & { whenReady: () => Promise<void> }, () => window ??= makeWindow())
  app.emit('second-instance')
  expect(actions).toEqual([])
  ready()
  await readiness; await Promise.resolve()
  expect(actions).toEqual(['create', 'show', 'focus'])
  actions.length = 0
  minimized = true
  app.emit('second-instance')
  await Promise.resolve()
  expect(actions).toEqual(['restore', 'show', 'focus'])
  actions.length = 0
  app.emit('activate')
  await Promise.resolve()
  expect(actions).toEqual(['show', 'focus'])
  actions.length = 0
  window = null
  app.emit('second-instance')
  await Promise.resolve()
  expect(actions).toEqual(['create', 'show', 'focus'])
})
