import { describe, expect, test } from 'bun:test'
import { googleAccountScope } from '../src/main/google-account-scope'

describe('Google chat-history account scope', () => {
  test('stays stable when a reconnect adds the Google subject claim', () => {
    const beforeReconnect = googleAccountScope({
      email: ' Person@Example.com ',
      refreshToken: 'old-refresh-token'
    })
    const afterReconnect = googleAccountScope({
      email: 'person@example.com',
      subject: 'stable-google-subject',
      refreshToken: 'new-refresh-token'
    })

    expect(afterReconnect).toBe(beforeReconnect)
    expect(afterReconnect).not.toContain('person@example.com')
  })
})
