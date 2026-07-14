import { motion } from 'framer-motion'
import { ArrowLeft, Moon } from '@phosphor-icons/react'
import { ErrorState } from '@/components/ErrorState'
import { Panel, SectionHeader } from '@/components/Panel'
import { SkeletonBlock, SkeletonSleepStages, SkeletonText } from '@/components/Skeleton'
import { SleepStages, STAGE_COLOR, STAGE_LABEL } from '@/components/SleepStages'
import { useSleepNight } from '@/hooks/useHealth'
import { formatMinutes, longDate } from '@/lib/format'
import { fade } from '@/lib/motion'
import type { SleepNight, SleepStageType } from '@shared/types'

const STAGE_ORDER: SleepStageType[] = ['AWAKE', 'REM', 'LIGHT', 'DEEP']

const STAGE_DESCRIPTION: Record<SleepStageType, string> = {
  AWAKE: 'Time awake within the recorded sleep period',
  REM: 'Dream-rich sleep associated with memory processing',
  LIGHT: 'The lighter stages that make up most of the night',
  DEEP: 'The most physically restorative stage of sleep'
}

interface SleepStagesDetailViewProps {
  date: string
  onBack: () => void
}

export function SleepStagesDetailView({ date, onBack }: SleepStagesDetailViewProps): React.JSX.Element {
  const nightQuery = useSleepNight(date)
  const night = nightQuery.data ?? null

  if (nightQuery.isError) {
    return (
      <ErrorState
        message={nightQuery.error instanceof Error ? nightQuery.error.message : undefined}
        onRetry={() => void nightQuery.refetch()}
      />
    )
  }

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-5 px-8 pb-12">
      <motion.header custom={0} variants={fade} initial="hidden" animate="show" className="pt-2">
        <button
          type="button"
          onClick={onBack}
          className="-ml-1.5 mb-2 flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-[12.5px] font-medium text-ink-dim transition-colors hover:bg-white/[0.05] hover:text-ink"
        >
          <ArrowLeft size={13} weight="bold" />
          Back
        </button>
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-sleep-soft">
            <Moon size={22} weight="fill" style={{ color: 'var(--color-sleep)' }} />
          </div>
          <div>
            <h1 className="display text-[27px] font-bold leading-tight text-ink">Sleep stages</h1>
            <p className="text-[13px] text-ink-dim">Night ending {longDate(date)}</p>
          </div>
        </div>
      </motion.header>

      {nightQuery.isPending ? (
        <SleepStagesDetailSkeleton />
      ) : night && night.stages.length > 0 ? (
        <>
          <motion.div custom={1} variants={fade} initial="hidden" animate="show">
            <Panel className="p-6">
              <SectionHeader
                title="Night timeline"
                hint="Hover any stage block to see its time and duration"
                icon={<Moon size={18} weight="fill" style={{ color: 'var(--color-sleep)' }} />}
              />
              <div className="mt-7">
                <SleepStages night={night} />
              </div>
            </Panel>
          </motion.div>

          <motion.div
            custom={2}
            variants={fade}
            initial="hidden"
            animate="show"
            className="display-stage-card-grid"
          >
            {STAGE_ORDER.map((stage) => (
              <StageCard key={stage} stage={stage} night={night} />
            ))}
          </motion.div>

          <motion.div custom={3} variants={fade} initial="hidden" animate="show">
            <Panel className="p-6">
              <SectionHeader
                title="Sleep architecture"
                hint="Timing and continuity details for this night"
              />
              <div className="display-md-three-grid mt-5 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-hairline pt-5">
                <ArchitectureMetric
                  label="To first deep or REM"
                  value={formatOptionalMinutes(night.minutesToFirstDeepOrRem)}
                />
                <ArchitectureMetric
                  label="Deep + REM"
                  value={formatMinutes(night.deepRemMinutes)}
                  detail={night.minutesAsleep > 0 ? `${Math.round((night.deepRemMinutes / night.minutesAsleep) * 100)}% of sleep` : undefined}
                />
                <ArchitectureMetric label="Awake" value={formatOptionalMinutes(night.minutesAwake)} />
                <ArchitectureMetric
                  label="Interruptions"
                  value={`${night.interruptionCount} ${night.interruptionCount === 1 ? 'moment' : 'moments'}`}
                  detail={formatMinutes(night.interruptionMinutes)}
                />
                <ArchitectureMetric
                  label="Time to fall asleep"
                  value={formatOptionalMinutes(night.minutesToFallAsleep)}
                />
                <ArchitectureMetric
                  label="After final wake"
                  value={formatOptionalMinutes(night.minutesAfterWakeUp)}
                />
              </div>
            </Panel>
          </motion.div>
        </>
      ) : (
        <Panel className="grid min-h-48 place-items-center p-12 text-[13px] text-ink-faint">
          No sleep stages recorded for this night.
        </Panel>
      )}
    </div>
  )
}

function StageCard({ stage, night }: { stage: SleepStageType; night: SleepNight }): React.JSX.Element {
  const minutes = night.stageMinutes[stage] ?? 0
  const stagedMinutes = STAGE_ORDER.reduce((sum, key) => sum + (night.stageMinutes[key] ?? 0), 0)
  const share = stagedMinutes > 0 ? Math.round((minutes / stagedMinutes) * 100) : 0
  const periods = night.stageCounts[stage] ?? 0

  return (
    <Panel className="relative overflow-hidden p-5">
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-[2px]"
        style={{ background: STAGE_COLOR[stage] }}
      />
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: STAGE_COLOR[stage] }} />
        <h2 className="text-[12px] font-semibold text-ink-dim">{STAGE_LABEL[stage]}</h2>
      </div>
      <div className="mt-4 font-mono text-[24px] font-medium leading-none text-ink">{formatMinutes(minutes)}</div>
      <div className="mt-2 text-[10.5px] text-ink-faint">
        {share}% of staged time · {periods} {periods === 1 ? 'period' : 'periods'}
      </div>
      <p className="mt-4 border-t border-hairline pt-3 text-[10.5px] leading-relaxed text-ink-faint">
        {STAGE_DESCRIPTION[stage]}
      </p>
    </Panel>
  )
}

function ArchitectureMetric({ label, value, detail }: { label: string; value: string; detail?: string }): React.JSX.Element {
  return (
    <div>
      <div className="text-[10.5px] font-medium text-ink-faint">{label}</div>
      <div className="mt-1 font-mono text-[15px] font-medium text-ink">{value}</div>
      {detail && <div className="mt-1 text-[10px] text-ink-faint">{detail}</div>}
    </div>
  )
}

function formatOptionalMinutes(value: number | null): string {
  return value == null ? '—' : formatMinutes(value)
}

function SleepStagesDetailSkeleton(): React.JSX.Element {
  return (
    <>
      <Panel className="p-6" aria-hidden>
        <SkeletonText className="w-32" />
        <SkeletonText className="mt-2 w-56" />
        <div className="mt-7">
          <SkeletonSleepStages />
        </div>
      </Panel>
      <div className="display-stage-card-grid" aria-hidden>
        {Array.from({ length: 4 }, (_, index) => (
          <Panel key={index} className="flex flex-col gap-3 p-5">
            <SkeletonText className="w-16" />
            <SkeletonBlock className="h-7 w-20" />
            <SkeletonText className="w-28" />
          </Panel>
        ))}
      </div>
    </>
  )
}
