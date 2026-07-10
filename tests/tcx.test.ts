import { describe, expect, test } from 'bun:test'
import { parseExerciseTcx } from '../src/main/tcx'

describe('TCX workout track parsing', () => {
  test('reads route, altitude, heart rate, and cadence trackpoints', () => {
    const result = parseExerciseTcx(`
      <TrainingCenterDatabase>
        <Track>
          <Trackpoint>
            <Time>2026-07-10T08:00:00Z</Time>
            <Position>
              <LatitudeDegrees>51.5074</LatitudeDegrees>
              <LongitudeDegrees>-0.1278</LongitudeDegrees>
            </Position>
            <AltitudeMeters>32.5</AltitudeMeters>
            <HeartRateBpm><Value>141</Value></HeartRateBpm>
            <Cadence>167</Cadence>
          </Trackpoint>
        </Track>
      </TrainingCenterDatabase>
    `)

    expect(result.points).toEqual([
      {
        time: '2026-07-10T08:00:00Z',
        latitude: 51.5074,
        longitude: -0.1278,
        altitudeM: 32.5,
        heartRate: 141,
        cadence: 167
      }
    ])
  })

  test('retains partial namespaced trackpoints without GPS', () => {
    const result = parseExerciseTcx(`
      <tcx:Trackpoint>
        <tcx:Time>2026-07-10T08:01:00Z</tcx:Time>
        <tcx:HeartRateBpm><tcx:Value>146</tcx:Value></tcx:HeartRateBpm>
      </tcx:Trackpoint>
    `)

    expect(result.points[0]).toMatchObject({ latitude: null, longitude: null, heartRate: 146 })
  })
})
