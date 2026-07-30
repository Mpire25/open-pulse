import { afterEach, describe, expect, test } from 'bun:test'
import {
  dailyRollUp,
  getFirstDataPoint,
  listData,
  listPairedDevices,
  listRawData,
  physicalRollUp
} from '../src/main/health-api'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('Health API response projections', () => {
  test('requests only one lightweight point for an intraday timezone probe', async () => {
    let requestedUrl = ''
    globalThis.fetch = (async (input) => {
      requestedUrl = String(input)
      return new Response(JSON.stringify({ dataPoints: [] }), { status: 200 })
    }) as typeof fetch

    await getFirstDataPoint(
      'token',
      'heart-rate',
      'sample',
      '2026-07-01',
      '2026-07-02',
      'google-wearables',
      0,
      undefined
    )

    const url = new URL(requestedUrl)
    expect(url.pathname).toEndWith('/heart-rate/dataPoints:reconcile')
    expect(url.searchParams.get('pageSize')).toBe('1')
    expect(url.searchParams.get('fields')).toBe('dataPoints(heartRate)')
  })

  test('requests one-minute average heart-rate rollups', async () => {
    let requestedUrl = ''
    let requestedBody: Record<string, unknown> = {}
    globalThis.fetch = (async (input, init) => {
      requestedUrl = String(input)
      requestedBody = JSON.parse(String(init?.body)) as Record<string, unknown>
      return new Response(JSON.stringify({ rollupDataPoints: [] }), { status: 200 })
    }) as typeof fetch

    await physicalRollUp(
      'token',
      'heart-rate',
      '2026-07-01T00:00:00Z',
      '2026-07-02T00:00:00Z',
      60,
      'google-wearables'
    )

    const url = new URL(requestedUrl)
    expect(url.pathname).toEndWith('/heart-rate/dataPoints:rollUp')
    expect(url.searchParams.get('fields')).toBe(
      'nextPageToken,rollupDataPoints(startTime,heartRate/beatsPerMinuteAvg)'
    )
    expect(requestedBody).toMatchObject({
      windowSize: '60s',
      pageSize: 1440,
      dataSourceFamily: 'users/me/dataSourceFamilies/google-wearables'
    })
  })

  test('requests one-hour step-count rollups', async () => {
    let requestedUrl = ''
    let requestedBody: Record<string, unknown> = {}
    globalThis.fetch = (async (input, init) => {
      requestedUrl = String(input)
      requestedBody = JSON.parse(String(init?.body)) as Record<string, unknown>
      return new Response(JSON.stringify({ rollupDataPoints: [] }), { status: 200 })
    }) as typeof fetch

    await physicalRollUp(
      'token',
      'steps',
      '2026-07-01T00:00:00Z',
      '2026-07-02T00:00:00Z',
      60 * 60,
      'google-wearables'
    )

    const url = new URL(requestedUrl)
    expect(url.pathname).toEndWith('/steps/dataPoints:rollUp')
    expect(url.searchParams.get('fields')).toBe(
      'nextPageToken,rollupDataPoints(startTime,steps/countSum)'
    )
    expect(requestedBody).toMatchObject({
      windowSize: '3600s',
      pageSize: 24,
      dataSourceFamily: 'users/me/dataSourceFamilies/google-wearables'
    })
  })

  test('requests only the heart-rate data payload and pagination token', async () => {
    let requestedUrl = ''
    globalThis.fetch = (async (input) => {
      requestedUrl = String(input)
      return new Response(JSON.stringify({ dataPoints: [] }), { status: 200 })
    }) as typeof fetch

    await listData('token', 'heart-rate', 'sample', '2026-07-01', '2026-07-02', 'google-wearables')

    const fields = new URL(requestedUrl).searchParams.get('fields')
    expect(fields).toBe('nextPageToken,dataPoints(heartRate)')
  })

  test('uses reconciled data-point fields accepted by the reconcile endpoint', async () => {
    let requestedUrl = ''
    globalThis.fetch = (async (input) => {
      requestedUrl = String(input)
      return new Response(JSON.stringify({ dataPoints: [] }), { status: 200 })
    }) as typeof fetch

    await listData('token', 'exercise', 'session', '2026-07-01', '2026-07-02')

    const fields = new URL(requestedUrl).searchParams.get('fields')
    expect(fields).toBe('nextPageToken,dataPoints(dataPointName,exercise)')
    expect(fields).not.toContain('dataPoints(name')
    expect(fields).not.toContain('dataSource')
  })

  test('uses raw data-point names only on the list endpoint', async () => {
    let requestedUrl = ''
    globalThis.fetch = (async (input) => {
      requestedUrl = String(input)
      return new Response(JSON.stringify({ dataPoints: [] }), { status: 200 })
    }) as typeof fetch

    await listRawData('token', 'nutrition-log', 'session', '2026-07-01', '2026-07-02')

    const fields = new URL(requestedUrl).searchParams.get('fields')
    expect(fields).toBe('nextPageToken,dataPoints(name,nutritionLog)')
    expect(fields).not.toContain('dataPointName')
  })

  test('requests only supported sleep summary metadata', async () => {
    let requestedUrl = ''
    globalThis.fetch = (async (input) => {
      requestedUrl = String(input)
      return new Response(JSON.stringify({ dataPoints: [] }), { status: 200 })
    }) as typeof fetch

    await listData(
      'token',
      'sleep',
      'sleep',
      '2026-07-01',
      '2026-07-02',
      'google-wearables',
      1,
      undefined,
      'sleep(interval(startTime,endTime,civilEndTime),summary(minutesAsleep,minutesInSleepPeriod),metadata(nap))'
    )

    const fields = new URL(requestedUrl).searchParams.get('fields')
    expect(fields).toContain('metadata(nap)')
    expect(fields).not.toContain('metadata(nap,main)')
  })

  test('excludes persistent device identifiers from paired-device responses', async () => {
    let requestedUrl = ''
    globalThis.fetch = (async (input) => {
      requestedUrl = String(input)
      return new Response(JSON.stringify({ pairedDevices: [] }), { status: 200 })
    }) as typeof fetch

    await listPairedDevices('token')

    const fields = new URL(requestedUrl).searchParams.get('fields')
    expect(fields).toContain('batteryLevel')
    expect(fields).not.toContain('macAddress')
  })

  test('fails locally instead of guessing a field name for an unmapped data type', async () => {
    let fetchCount = 0
    globalThis.fetch = (async () => {
      fetchCount += 1
      return new Response(JSON.stringify({ rollupDataPoints: [] }), { status: 200 })
    }) as typeof fetch

    await expect(
      dailyRollUp('token', 'future-health-signal', '2026-07-01', '2026-07-02')
    ).rejects.toThrow('No Google Health response field projection configured for future-health-signal')
    expect(fetchCount).toBe(0)
  })
})
