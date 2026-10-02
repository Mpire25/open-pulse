import { motion } from 'framer-motion'
import { Panel, SectionHeader } from '@/components/Panel'
import { DashboardChart, DashboardRing, DashboardSummary } from '@/components/DashboardWidgets'
import {
  DashboardEditControls,
  EditableDashboardSlot,
  useDashboardEditor
} from '@/components/DashboardEditor'
import { CARD_HEIGHT } from '@/components/Skeleton'
import { ErrorState } from '@/components/ErrorState'
import type { View } from '@/components/Sidebar'
import { greeting, longDate } from '@/lib/format'
import type { MetricRange, OpenMetric } from '@/lib/metric-navigation'
import { fade } from '@/lib/motion'
import type { Goals, Workout } from '@shared/types'
import { DASHBOARD_SLOTS } from '@shared/dashboard'

interface HomeViewProps {
  date: string
  today: string
  goals: Goals
  onOpenMetric: OpenMetric
  onOpenWorkout: (workout: Workout) => void
  onOpenWorkouts: (initialRange?: MetricRange) => void
  onNavigate: (view: View) => void
}

export function HomeView({
  date,
  today,
  goals,
  onOpenMetric,
  onOpenWorkout,
  onOpenWorkouts,
  onNavigate
}: HomeViewProps): React.JSX.Element {
  const editor = useDashboardEditor('home')
  if (editor.isError)
    return (
      <ErrorState
        message="Could not load your homepage layout."
        onRetry={() => void editor.refetch()}
      />
    )
  const layout = editor.layout
  if (!layout)
    return (
      <div className="p-8 text-[13px] text-ink-dim" role="status">
        Loading your homepage…
      </div>
    )
  const rings = ['ring1', 'ring2', 'ring3']
  const summaries = ['summary1', 'summary2', 'summary3']
  const signals = ['signal1', 'signal2', 'signal3', 'signal4']
  const defaultSignals = signals.every((id) => {
    const widget = layout[id]
    const original = DASHBOARD_SLOTS.home.find((slot) => slot.id === id)!.defaultWidget
    return 'metric' in widget && 'metric' in original && widget.metric === original.metric
  })
  // Opening details unmounts Home and would discard the unsaved layout draft.
  const openMetric: OpenMetric = (...args) => {
    if (!editor.editing) onOpenMetric(...args)
  }
  const chart = (id: string, wide = false): React.JSX.Element => (
    <EditableDashboardSlot id={id} editor={editor} fill>
      <DashboardChart
        widget={layout[id]}
        date={date}
        goals={goals}
        wide={wide}
        onOpen={openMetric}
        onSleep={() => { if (!editor.editing) onNavigate('sleep') }}
        onWorkouts={() => { if (!editor.editing) onOpenWorkouts('D') }}
        onWorkout={(workout) => { if (!editor.editing) onOpenWorkout(workout) }}
      />
    </EditableDashboardSlot>
  )
  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-5 px-8 pb-12">
      <motion.header
        custom={0}
        variants={fade}
        initial="hidden"
        animate="show"
        className="flex flex-wrap items-end justify-between gap-4 pt-2"
      >
        <div>
          <p className="text-[13px] font-medium text-ink-dim">
            {date === today ? greeting() : 'Reviewing'}
          </p>
          <h1 className="display mt-1 text-[27px] font-bold text-ink">{longDate(date)}</h1>
        </div>
      </motion.header>
      <motion.div custom={1} variants={fade} initial="hidden" animate="show" className="relative">
        <div className="absolute bottom-full right-0 mb-2">
          <DashboardEditControls editor={editor} />
        </div>
        <Panel className={`home-hero ${CARD_HEIGHT.hero}`}>
          <div className="home-goal-rings">
            {rings.map((id) => {
              const widget = layout[id]
              return (
                <EditableDashboardSlot id={id} editor={editor} key={id}>
                  {'metric' in widget && (
                    <DashboardRing
                      metric={widget.metric}
                      date={date}
                      goals={goals}
                      onOpen={openMetric}
                    />
                  )}
                </EditableDashboardSlot>
              )
            })}
          </div>
          <div className="home-hero-stats">
            {summaries.map((id) => {
              const widget = layout[id]
              return (
                <EditableDashboardSlot id={id} editor={editor} key={id}>
                  {'metric' in widget && (
                    <DashboardSummary
                      metric={widget.metric}
                      date={date}
                      goals={goals}
                      onOpen={openMetric}
                      presentation="hero"
                    />
                  )}
                </EditableDashboardSlot>
              )
            })}
          </div>
        </Panel>
      </motion.div>
      <div className="display-lg-pair-grid display-lg-pair-grid--weighted-135">
        {['chart1', 'chart2'].map((id, i) => (
          <motion.div
            key={id}
            custom={i + 2}
            variants={fade}
            initial="hidden"
            animate="show"
            className="min-w-0"
          >
            {chart(id)}
          </motion.div>
        ))}
      </div>
      <motion.div custom={4} variants={fade} initial="hidden" animate="show">
        <Panel className={`dashboard-signals-panel ${editor.editing ? 'overflow-visible' : 'overflow-hidden'} ${CARD_HEIGHT.summary}`}>
          <div className="border-b border-hairline px-5 pb-3 pt-4">
            <SectionHeader
              title={defaultSignals ? 'Night signals' : 'Metric highlights'}
              hint={
                defaultSignals
                  ? 'Compared with your own recent baseline'
                  : 'Your selected health metrics'
              }
            />
          </div>
          <div className="display-four-grid divide-x divide-hairline">
            {signals.map((id) => {
              const widget = layout[id]
              return (
                <EditableDashboardSlot id={id} editor={editor} key={id}>
                  {'metric' in widget && (
                    <DashboardSummary
                      metric={widget.metric}
                      date={date}
                      goals={goals}
                      onOpen={openMetric}
                      presentation="tile"
                    />
                  )}
                </EditableDashboardSlot>
              )
            })}
          </div>
        </Panel>
      </motion.div>
      <motion.div custom={5} variants={fade} initial="hidden" animate="show">
        {chart('wide', true)}
      </motion.div>
    </div>
  )
}
