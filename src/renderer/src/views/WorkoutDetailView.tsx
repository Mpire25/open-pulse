import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  CalendarBlank,
  Clock,
  Fire,
  Footprints,
  Gauge,
  Heartbeat,
  Lightning,
  MapPin,
  Mountains,
  PersonSimpleRun,
  StackSimple,
  SwimmingPool,
  Timer
} from '@phosphor-icons/react'
import { Panel, SectionHeader } from '@/components/Panel'
import { IntradayLine } from '@/components/charts'
import { SkeletonChart } from '@/components/Skeleton'
import { useHeartDetail, useIntraday, useWorkoutTrack } from '@/hooks/useHealth'
import { formatClock, formatInt, formatMinuteOfDay, formatMinutes, longDate } from '@/lib/format'
import { fade } from '@/lib/motion'
import type { HeartZoneDetail, Workout, WorkoutSplit, WorkoutTrackPoint } from '@shared/types'

interface WorkoutDetailViewProps {
  workout: Workout
  date: string
  onBack: () => void
}

interface DetailItem {
  label: string
  value: string
  icon: React.ReactNode
}

export function WorkoutDetailView({ workout, date, onBack }: WorkoutDetailViewProps): React.JSX.Element {
  const [showHeartRateZones, setShowHeartRateZones] = useState(false)
  const intraday = useIntraday(date)
  const track = useWorkoutTrack(workout.id, workout.hasGps !== false)
  const heartZoneDetail = useHeartDetail(date, 'restingHeartRate', workout.heartRateZones != null)
  const elapsedMinutes = workout.elapsedDurationMin ?? workout.durationMin
  const startDate = new Date(workout.startTime)
  const startMinute = workout.startMinute ?? startDate.getHours() * 60 + startDate.getMinutes()
  const endMinute = Math.min(1440, startMinute + elapsedMinutes)
  const startLabel = formatMinuteOfDay(startMinute)
  const endLabel = formatMinuteOfDay(endMinute)
  const intradayHeartPoints = (intraday.data?.heartRate ?? []).filter(
    (point) => point.minute >= startMinute && point.minute <= endMinute
  )
  const trackHeartPoints = (track.data?.points ?? []).flatMap((point) => {
    if (point.time == null || point.heartRate == null) return []
    const elapsed = (new Date(point.time).getTime() - startDate.getTime()) / 60_000
    return Number.isFinite(elapsed) ? [{ minute: startMinute + elapsed, bpm: point.heartRate }] : []
  })
  const heartPoints = intradayHeartPoints.length > 1 ? intradayHeartPoints : trackHeartPoints
  const heartValues = heartPoints.map((point) => point.bpm)
  const heartMin = heartValues.length ? Math.min(...heartValues) : null
  const heartMax = heartValues.length ? Math.max(...heartValues) : null
  const heartAvg = heartValues.length
    ? Math.round(heartValues.reduce((sum, value) => sum + value, 0) / heartValues.length)
    : workout.avgHeartRate

  const summary: DetailItem[] = [
    { label: 'Active duration', value: formatMinutes(workout.durationMin), icon: <Timer size={16} weight="fill" /> },
    ...(workout.distanceKm != null
      ? [{ label: 'Distance', value: `${workout.distanceKm.toFixed(2)} km`, icon: <MapPin size={16} weight="fill" /> }]
      : []),
    ...(workout.calories != null
      ? [{ label: 'Calories', value: `${formatInt(workout.calories)} kcal`, icon: <Fire size={16} weight="fill" /> }]
      : []),
    ...(heartAvg != null
      ? [{ label: 'Average heart rate', value: `${heartAvg} bpm`, icon: <Heartbeat size={16} weight="fill" /> }]
      : []),
    ...(workout.steps != null
      ? [{ label: 'Steps', value: formatInt(workout.steps), icon: <Footprints size={16} weight="fill" /> }]
      : []),
    ...(workout.activeZoneMinutes != null
      ? [{ label: 'Zone minutes', value: formatMinutes(workout.activeZoneMinutes), icon: <Lightning size={16} weight="fill" /> }]
      : [])
  ]

  const performance = performanceItems(workout)
  const routePoints = (track.data?.points ?? []).filter(
    (point): point is WorkoutTrackPoint & { latitude: number; longitude: number } =>
      point.latitude != null && point.longitude != null
  )
  const showRoute = workout.hasGps === true || routePoints.length > 1
  const zones = zoneItems(workout, heartZoneDetail.data?.zones)
  const heartRateChartZones = chartZoneItems(heartZoneDetail.data?.zones)
  const specialized = specializedItems(workout)

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-5 px-8 pb-12">
      <motion.header custom={0} variants={fade} initial="hidden" animate="show" className="pt-2">
        <button
          type="button"
          onClick={onBack}
          className="-ml-1.5 mb-2 flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-[12.5px] font-medium text-ink-dim transition-colors hover:bg-white/[0.05] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          <ArrowLeft size={13} weight="bold" />
          Back to workouts
        </button>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-recovery-soft text-recovery">
              <PersonSimpleRun size={22} weight="fill" />
            </div>
            <div className="min-w-0">
              <h1 className="display truncate text-[27px] font-bold leading-tight text-ink">{workout.name}</h1>
              <p className="mt-0.5 text-[13px] text-ink-dim">
                {longDate(date)} · {startLabel}–{endLabel}
              </p>
            </div>
          </div>
          {(workout.deviceName || workout.recordingSource) && (
            <div className="rounded-full border border-hairline bg-white/[0.025] px-3 py-1.5 text-[11px] text-ink-dim">
              {workout.deviceName ?? titleCase(workout.recordingSource ?? '')}
            </div>
          )}
        </div>
      </motion.header>

      <motion.div custom={1} variants={fade} initial="hidden" animate="show">
        <Panel className="grid grid-cols-2 gap-2 p-2 sm:grid-cols-3 xl:grid-cols-6">
          {summary.map((item) => (
            <DetailStat key={item.label} item={item} />
          ))}
        </Panel>
      </motion.div>

      <motion.div custom={2} variants={fade} initial="hidden" animate="show">
        <Panel className="flex min-h-[286px] flex-col gap-4 p-5">
          <SectionHeader
            title="Heart rate"
            hint={heartPoints.length ? `${heartPoints.length} readings during this workout` : 'Recorded workout window'}
            icon={<Heartbeat size={18} weight="fill" className="text-heart" />}
            action={
              heartValues.length > 0 || heartRateChartZones.length > 0 ? (
                <div className="flex items-center gap-3">
                  {heartValues.length > 0 && (
                    <div className="hidden gap-4 text-right sm:flex">
                      <SmallValue label="Low" value={`${heartMin} bpm`} />
                      <SmallValue label="Average" value={`${heartAvg} bpm`} />
                      <SmallValue label="High" value={`${heartMax} bpm`} />
                    </div>
                  )}
                  {heartRateChartZones.length > 0 && (
                    <>
                      {heartValues.length > 0 && <span className="hidden h-8 w-px bg-hairline sm:block" />}
                      <motion.button
                        type="button"
                        aria-pressed={showHeartRateZones}
                        aria-label={`${showHeartRateZones ? 'Hide' : 'Show'} heart-rate zones on chart`}
                        title={`${showHeartRateZones ? 'Hide' : 'Show'} zone overlay`}
                        onClick={() => setShowHeartRateZones((visible) => !visible)}
                        whileTap={{ scale: 0.97 }}
                        transition={{ type: 'spring', stiffness: 350, damping: 24 }}
                        className={`inline-flex h-8 items-center gap-1.5 rounded-[9px] border px-2.5 text-[10.5px] font-semibold transition-[background-color,border-color,color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heart/40 ${
                          showHeartRateZones
                            ? 'border-heart/30 bg-heart-soft text-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.06)]'
                            : 'border-hairline bg-white/[0.02] text-ink-dim hover:border-hairline-strong hover:bg-white/[0.045] hover:text-ink'
                        }`}
                      >
                        <StackSimple
                          size={14}
                          weight={showHeartRateZones ? 'fill' : 'regular'}
                          className={showHeartRateZones ? 'text-heart' : 'text-ink-faint'}
                        />
                        Zones
                      </motion.button>
                    </>
                  )}
                </div>
              ) : undefined
            }
          />
          {heartValues.length > 0 && (
            <div className="grid grid-cols-3 gap-4 border-t border-hairline pt-3 sm:hidden">
              <SmallValue label="Low" value={`${heartMin} bpm`} />
              <SmallValue label="Average" value={`${heartAvg} bpm`} />
              <SmallValue label="High" value={`${heartMax} bpm`} />
            </div>
          )}
          <div className="mt-auto">
            {intraday.isPending ? (
              <SkeletonChart height={190} columns={12} />
            ) : heartPoints.length > 1 ? (
              <IntradayLine
                points={heartPoints}
                color="var(--color-heart)"
                height={190}
                domain={{ startMinute, endMinute }}
                zones={showHeartRateZones ? heartRateChartZones : undefined}
              />
            ) : (
              <div className="grid h-[190px] place-items-center text-[13px] text-ink-faint">
                No heart-rate samples were recorded during this workout.
              </div>
            )}
          </div>
        </Panel>
      </motion.div>

      {(zones.length > 0 || showRoute) && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {zones.length > 0 && (
            <motion.div
              custom={3}
              variants={fade}
              initial="hidden"
              animate="show"
              className="min-w-0 lg:col-span-2"
            >
              <HeartRateZones zones={zones} />
            </motion.div>
          )}
          {showRoute && (
            <motion.div
              custom={4}
              variants={fade}
              initial="hidden"
              animate="show"
              className="min-w-0 lg:col-span-2"
            >
              <Panel className="h-full min-h-[258px] p-5">
                <SectionHeader
                  title="Route"
                  hint={routePoints.length ? `${routePoints.length} GPS trackpoints` : 'Recorded GPS trace'}
                  icon={<MapPin size={18} weight="fill" className="text-recovery" />}
                />
                <div className="mt-4">
                  {track.isPending ? (
                    <SkeletonChart height={180} columns={10} />
                  ) : routePoints.length > 1 ? (
                    <RoutePlot points={routePoints} />
                  ) : (
                    <div className="grid h-[180px] place-items-center text-center text-[13px] text-ink-faint">
                      The workout is marked as GPS-tracked, but no route points were available.
                    </div>
                  )}
                </div>
              </Panel>
            </motion.div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <motion.div custom={5} variants={fade} initial="hidden" animate="show" className="min-w-0">
          <Panel className="h-full p-6">
            <SectionHeader
              title="Session timing"
              hint="Elapsed time, active time, and recorded events"
              icon={<Clock size={18} weight="fill" className="text-recovery" />}
            />
            <div className="mt-7 grid grid-cols-[auto_1fr_auto] items-center gap-4">
              <TimePoint label="Started" value={startLabel} />
              <div className="relative h-px bg-hairline-strong">
                <span className="absolute left-0 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-recovery" />
                <span className="absolute right-0 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-recovery" />
              </div>
              <TimePoint label="Finished" value={endLabel} align="right" />
            </div>
            <div className="mt-7 grid grid-cols-2 gap-4 border-t border-hairline pt-4 sm:grid-cols-3">
              <SmallValue label="Active" value={formatMinutes(workout.durationMin)} />
              <SmallValue label="Elapsed" value={formatMinutes(elapsedMinutes)} />
              {elapsedMinutes > workout.durationMin && (
                <SmallValue label="Paused" value={formatMinutes(elapsedMinutes - workout.durationMin)} />
              )}
            </div>
            {(workout.events?.length ?? 0) > 0 && (
              <div className="mt-5 flex flex-wrap gap-2 border-t border-hairline pt-4">
                {workout.events?.map((event, index) => (
                  <span
                    key={`${event.time}-${event.type}-${index}`}
                    className="rounded-full border border-hairline bg-white/[0.025] px-2.5 py-1 text-[10.5px] text-ink-dim"
                  >
                    {titleCase(event.type)} · {event.minute != null ? formatMinuteOfDay(event.minute) : formatClock(event.time)}
                  </span>
                ))}
              </div>
            )}
          </Panel>
        </motion.div>

        <motion.div custom={6} variants={fade} initial="hidden" animate="show" className="min-w-0">
          <Panel className="h-full p-6">
            <SectionHeader
              title="Performance"
              hint="Native exercise metrics where available"
              icon={<Gauge size={18} weight="fill" className="text-recovery" />}
            />
            {performance.length > 0 ? (
              <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4">
                {performance.map((item) => (
                  <div key={item.label} className="border-t border-hairline pt-3">
                    <div className="text-[11px] text-ink-faint">{item.label}</div>
                    <div className="mt-1 font-mono text-[15px] font-medium text-ink">{item.value}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-8 text-[13px] leading-relaxed text-ink-faint">
                This workout does not include enough recorded metrics for performance details.
              </div>
            )}
          </Panel>
        </motion.div>
      </div>

      {specialized.length > 0 && (
        <motion.div custom={7} variants={fade} initial="hidden" animate="show">
          <Panel className="p-5">
            <SectionHeader
              title="Advanced metrics"
              hint="Sport-specific measurements supplied by the tracker"
              icon={<Mountains size={18} weight="fill" className="text-recovery" />}
            />
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {specialized.map((item) => (
                <DetailStat key={item.label} item={item} />
              ))}
            </div>
          </Panel>
        </motion.div>
      )}

      {(workout.splits?.length ?? 0) > 0 && (
        <motion.div custom={8} variants={fade} initial="hidden" animate="show">
          <SplitsTable splits={workout.splits ?? []} />
        </motion.div>
      )}
    </div>
  )
}

function DetailStat({ item }: { item: DetailItem }): React.JSX.Element {
  return (
    <div className="min-w-0 rounded-[16px] bg-white/[0.025] px-4 py-4">
      <div className="flex items-center gap-2 text-[11px] text-ink-faint">
        <span className="text-recovery">{item.icon}</span>
        <span className="truncate">{item.label}</span>
      </div>
      <div className="mt-2 truncate font-mono text-[15px] font-medium text-ink">{item.value}</div>
    </div>
  )
}

function SmallValue({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div>
      <div className="text-[10.5px] text-ink-faint">{label}</div>
      <div className="mt-0.5 whitespace-nowrap font-mono text-[12.5px] font-medium text-ink">{value}</div>
    </div>
  )
}

function TimePoint({ label, value, align = 'left' }: { label: string; value: string; align?: 'left' | 'right' }): React.JSX.Element {
  return (
    <div className={align === 'right' ? 'text-right' : undefined}>
      <div className="text-[11px] text-ink-faint">{label}</div>
      <div className="mt-1 whitespace-nowrap font-mono text-[15px] font-medium text-ink">{value}</div>
    </div>
  )
}

function HeartRateZones({ zones }: { zones: ReturnType<typeof zoneItems> }): React.JSX.Element {
  const total = zones.reduce((sum, zone) => sum + zone.minutes, 0)
  return (
    <Panel className="p-5">
      <SectionHeader
        title="Heart-rate zones"
        hint={`${formatMinutes(total)} with a classified zone`}
        icon={<Lightning size={18} weight="fill" className="text-heart" />}
      />
      <div className="mt-5 flex h-3 overflow-hidden rounded-full bg-white/[0.035]">
        {zones.map((zone) => (
          <span key={zone.label} style={{ width: `${(zone.minutes / total) * 100}%`, background: zone.color }} />
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-3">
        {zones.map((zone) => (
          <div key={zone.label} className="flex items-center justify-between gap-3 border-t border-hairline pt-3">
            <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-ink-dim">
              <span className="h-2 w-2 rounded-full" style={{ background: zone.color }} />
              <span>{zone.label}</span>
              {zone.range && <span className="whitespace-nowrap font-mono text-[10.5px] text-ink-faint">{zone.range}</span>}
            </span>
            <span className="font-mono text-[12px] text-ink">{formatMinutes(zone.minutes)}</span>
          </div>
        ))}
      </div>
    </Panel>
  )
}

function RoutePlot({ points }: { points: Array<WorkoutTrackPoint & { latitude: number; longitude: number }> }): React.JSX.Element {
  const width = 600
  const height = 180
  const pad = 14
  const averageLat = points.reduce((sum, point) => sum + point.latitude, 0) / points.length
  const projected = points.map((point) => ({
    x: point.longitude * Math.cos((averageLat * Math.PI) / 180),
    y: point.latitude
  }))
  const minX = Math.min(...projected.map((point) => point.x))
  const maxX = Math.max(...projected.map((point) => point.x))
  const minY = Math.min(...projected.map((point) => point.y))
  const maxY = Math.max(...projected.map((point) => point.y))
  const spanX = Math.max(maxX - minX, 1e-7)
  const spanY = Math.max(maxY - minY, 1e-7)
  const scale = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanY)
  const usedW = spanX * scale
  const usedH = spanY * scale
  const offsetX = (width - usedW) / 2
  const offsetY = (height - usedH) / 2
  const screenPoints = projected.map((point) => ({
    x: offsetX + (point.x - minX) * scale,
    y: height - offsetY - (point.y - minY) * scale
  }))
  const path = screenPoints.map((point, index) => `${index ? 'L' : 'M'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ')
  const start = screenPoints[0]
  const finish = screenPoints.at(-1)!

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-[180px] w-full" role="img" aria-label="Recorded workout route">
      {[0.25, 0.5, 0.75].map((ratio) => (
        <g key={ratio} stroke="var(--color-hairline)" strokeWidth="1">
          <line x1={width * ratio} x2={width * ratio} y1="0" y2={height} />
          <line x1="0" x2={width} y1={height * ratio} y2={height * ratio} />
        </g>
      ))}
      <path d={path} fill="none" stroke="var(--color-recovery)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={start.x} cy={start.y} r="6" fill="var(--color-recovery)" stroke="var(--color-panel)" strokeWidth="3" />
      <circle cx={finish.x} cy={finish.y} r="6" fill="var(--color-heart)" stroke="var(--color-panel)" strokeWidth="3" />
    </svg>
  )
}

function SplitsTable({ splits }: { splits: WorkoutSplit[] }): React.JSX.Element {
  return (
    <Panel className="overflow-hidden">
      <div className="px-5 pb-3 pt-5">
        <SectionHeader title="Splits and laps" hint={`${splits.length} recorded segment${splits.length === 1 ? '' : 's'}`} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] border-collapse text-left">
          <thead>
            <tr className="border-y border-hairline text-[10.5px] uppercase tracking-wide text-ink-faint">
              <th className="px-5 py-2.5 font-medium">Split</th>
              <th className="px-3 py-2.5 font-medium">Duration</th>
              <th className="px-3 py-2.5 font-medium">Distance</th>
              <th className="px-3 py-2.5 font-medium">Pace</th>
              <th className="px-3 py-2.5 font-medium">Heart rate</th>
              <th className="px-5 py-2.5 text-right font-medium">Calories</th>
            </tr>
          </thead>
          <tbody>
            {splits.map((split, index) => (
              <tr key={`${split.startTime}-${index}`} className="border-b border-hairline last:border-0">
                <td className="px-5 py-3 text-[12.5px] font-medium text-ink">
                  {index + 1}
                  {split.splitType ? <span className="ml-2 text-[10.5px] text-ink-faint">{titleCase(split.splitType)}</span> : null}
                </td>
                <TableMetric value={formatMinutes(split.durationMin)} />
                <TableMetric value={split.distanceKm != null ? `${split.distanceKm.toFixed(2)} km` : '—'} />
                <TableMetric value={split.averagePaceSecPerKm != null ? `${formatPaceSeconds(split.averagePaceSecPerKm)} /km` : '—'} />
                <TableMetric value={split.avgHeartRate != null ? `${split.avgHeartRate} bpm` : '—'} />
                <td className="px-5 py-3 text-right font-mono text-[12px] text-ink-dim">
                  {split.calories != null ? `${formatInt(split.calories)} kcal` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

function TableMetric({ value }: { value: string }): React.JSX.Element {
  return <td className="px-3 py-3 font-mono text-[12px] text-ink-dim">{value}</td>
}

function performanceItems(workout: Workout): Array<{ label: string; value: string }> {
  const durationHours = workout.durationMin / 60
  const pace = workout.averagePaceSecPerKm ??
    (workout.distanceKm != null && workout.distanceKm > 0 ? (workout.durationMin * 60) / workout.distanceKm : null)
  const speed = workout.averageSpeedKph ??
    (workout.distanceKm != null && durationHours > 0 ? workout.distanceKm / durationHours : null)
  const items: Array<{ label: string; value: string }> = []

  if (pace != null) items.push({ label: 'Average pace', value: `${formatPaceSeconds(pace)} /km` })
  if (speed != null) items.push({ label: 'Average speed', value: `${speed.toFixed(1)} km/h` })
  if (workout.elevationGainM != null) {
    items.push({ label: 'Elevation gain', value: `${formatInt(workout.elevationGainM)} m` })
  }
  if (workout.calories != null && durationHours > 0) {
    items.push({ label: 'Calorie rate', value: `${formatInt(workout.calories / durationHours)} kcal/h` })
  }
  if (workout.steps != null && workout.durationMin > 0) {
    items.push({ label: 'Step rate', value: `${formatInt(workout.steps / workout.durationMin)} steps/min` })
  }
  return items
}

function specializedItems(workout: Workout): DetailItem[] {
  const mobility = workout.mobility
  return [
    ...(mobility?.cadenceStepsPerMin != null
      ? [{ label: 'Cadence', value: `${formatInt(mobility.cadenceStepsPerMin)} spm`, icon: <Footprints size={16} weight="fill" /> }]
      : []),
    ...(mobility?.strideLengthM != null
      ? [{ label: 'Stride length', value: `${mobility.strideLengthM.toFixed(2)} m`, icon: <Footprints size={16} weight="fill" /> }]
      : []),
    ...(mobility?.groundContactMs != null
      ? [{ label: 'Ground contact', value: `${formatInt(mobility.groundContactMs)} ms`, icon: <Timer size={16} weight="fill" /> }]
      : []),
    ...(mobility?.verticalOscillationCm != null
      ? [{ label: 'Vertical oscillation', value: `${mobility.verticalOscillationCm.toFixed(1)} cm`, icon: <Mountains size={16} weight="fill" /> }]
      : []),
    ...(mobility?.verticalRatio != null
      ? [{ label: 'Vertical ratio', value: `${mobility.verticalRatio.toFixed(1)}%`, icon: <Gauge size={16} weight="fill" /> }]
      : []),
    ...(workout.totalSwimLengths != null
      ? [{ label: 'Pool lengths', value: formatInt(workout.totalSwimLengths), icon: <SwimmingPool size={16} weight="fill" /> }]
      : []),
    ...(workout.poolLengthM != null
      ? [{ label: 'Pool length', value: `${workout.poolLengthM.toFixed(1)} m`, icon: <SwimmingPool size={16} weight="fill" /> }]
      : [])
  ]
}

const HEART_ZONE_PRESENTATION: Record<HeartZoneDetail['zone'], { label: string; color: string }> = {
  light: { label: 'Light', color: 'var(--color-ink-dim)' },
  moderate: { label: 'Moderate', color: 'var(--color-activity)' },
  vigorous: { label: 'Vigorous', color: 'var(--color-heart)' },
  peak: { label: 'Peak', color: 'var(--color-danger)' }
}

function chartZoneItems(thresholds: HeartZoneDetail[] = []): Array<{
  label: string
  minBpm: number | null
  maxBpm: number | null
  color: string
}> {
  return thresholds.flatMap((threshold) =>
    threshold.minBpm != null || threshold.maxBpm != null
      ? [
          {
            ...HEART_ZONE_PRESENTATION[threshold.zone],
            minBpm: threshold.minBpm,
            maxBpm: threshold.maxBpm
          }
        ]
      : []
  )
}

function zoneItems(
  workout: Workout,
  thresholds: HeartZoneDetail[] = []
): Array<{ label: string; minutes: number; color: string; range: string | null }> {
  const zones = workout.heartRateZones
  if (!zones) return []
  const range = (zone: HeartZoneDetail['zone']): string | null => {
    const threshold = thresholds.find((item) => item.zone === zone)
    if (threshold?.minBpm != null && threshold.maxBpm != null) return `${threshold.minBpm}–${threshold.maxBpm} bpm`
    if (threshold?.minBpm != null) return `${threshold.minBpm}+ bpm`
    if (threshold?.maxBpm != null) return `≤${threshold.maxBpm} bpm`
    return null
  }
  return [
    { ...HEART_ZONE_PRESENTATION.light, minutes: zones.lightMin, range: range('light') },
    { ...HEART_ZONE_PRESENTATION.moderate, minutes: zones.moderateMin, range: range('moderate') },
    { ...HEART_ZONE_PRESENTATION.vigorous, minutes: zones.vigorousMin, range: range('vigorous') },
    { ...HEART_ZONE_PRESENTATION.peak, minutes: zones.peakMin, range: range('peak') }
  ].flatMap((zone) => (zone.minutes != null && zone.minutes > 0 ? [{ ...zone, minutes: zone.minutes }] : []))
}

function formatPaceSeconds(secondsPerKm: number): string {
  const totalSeconds = Math.round(secondsPerKm)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function titleCase(value: string): string {
  return value.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase())
}
