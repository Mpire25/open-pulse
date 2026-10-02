import { expect, test } from 'bun:test'
import { responseNotificationContent } from '../src/main/response-notification-content'

test('preview removes Markdown formatting, links, images and table syntax while keeping readable content', () => {
  const answer = '# Your **sleep**\n\nYou averaged *7h 12m*; ~~6h~~. [Details](https://example.invalid/private)\n\n- More `rest`\n- Less stress\n\n| Day | Hours |\n| --- | --- |\n| Monday | 7 |\n\n![Health chart](https://example.invalid/chart)\n\n<script>hidden()</script>'
  expect(responseNotificationContent('How did I sleep?', answer)).toEqual({
    title: 'How did I sleep?',
    body: 'Your sleep You averaged 7h 12m; 6h. Details More rest Less stress Day Hours Monday 7'
  })
})

test('preview truncates chat name and response without splitting emoji or combining characters', () => {
  const emoji = '👩🏽‍⚕️'
  const result = responseNotificationContent(emoji.repeat(81), 'e\u0301'.repeat(241))
  expect(result.title).toBe(emoji.repeat(79) + '…')
  expect(result.body).toBe('e\u0301'.repeat(239) + '…')
  expect(responseNotificationContent('q'.repeat(80), 'a'.repeat(240))).toEqual({ title: 'q'.repeat(80), body: 'a'.repeat(240) })
})

test('empty or visual-only answers use a clear fallback, and whitespace and control characters are cleaned', () => {
  expect(responseNotificationContent('', '![Chart](https://example.invalid)')).toEqual({ title: 'OpenPulse', body: 'Your response is ready. Open the chat to view it.' })
  expect(responseNotificationContent('  How\n did\tI sleep?\u202E\u0000 ', '## Summary\n\nGood\u200B rest &amp; recovery.')).toEqual({ title: 'How did I sleep?', body: 'Summary Good rest & recovery.' })
})
