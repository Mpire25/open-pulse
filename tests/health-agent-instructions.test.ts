import { describe, expect, test } from 'bun:test'
import {
  DAILY_METRICS_TOOL_DESCRIPTION,
  SLEEP_DATE_INSTRUCTION,
  SLEEP_TOOL_DESCRIPTION
} from '../src/main/health-agent-date-semantics'

describe('health assistant date semantics', () => {
  test('defines last night using the sleep session wake date', () => {
    expect(SLEEP_DATE_INSTRUCTION).toContain('"last night" means sleep ending today')
    expect(SLEEP_DATE_INSTRUCTION).toContain('Do not subtract a day from today')
  })

  test('repeats wake-date semantics at sleep-capable tools', () => {
    expect(DAILY_METRICS_TOOL_DESCRIPTION).toContain('"last night" is today, not yesterday')
    expect(SLEEP_TOOL_DESCRIPTION).toContain('"Last night" means the sleep session ending today')
    expect(SLEEP_TOOL_DESCRIPTION).toContain('"The night before last" means the session ending yesterday')
    expect(SLEEP_TOOL_DESCRIPTION).toContain('localStartTime and localEndTime are already converted')
  })
})
