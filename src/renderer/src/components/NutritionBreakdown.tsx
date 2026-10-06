// Day-view breakdown for a nutrition metric: the logged foods behind the
// day's number, ranked by how much each contributed.

import { Panel, SectionHeader } from '@/components/Panel'
import { CARD_HEIGHT, SkeletonBlock, SkeletonText } from '@/components/Skeleton'
import { METRICS } from '@/lib/metric-registry'
import { formatClock } from '@/lib/format'
import {
  NUTRITION_MEAL_GROUPS,
  nutritionBreakdown,
  nutritionMealGroup,
  type NutritionValueKey
} from '@shared/nutrition'
import type { MetricKey, NutritionLogEntry } from '@shared/types'

export const NUTRITION_BREAKDOWN_KEYS: Partial<Record<MetricKey, NutritionValueKey>> = {
  caloriesIn: 'calories',
  proteinG: 'proteinG',
  carbsG: 'carbsG',
  fatG: 'fatG',
  fiberG: 'fiberG',
  saturatedFatG: 'saturatedFatG',
  sodiumG: 'sodiumG',
  sugarG: 'sugarG'
}

export function isNutritionBreakdownMetric(metricKey: MetricKey): boolean {
  return NUTRITION_BREAKDOWN_KEYS[metricKey] != null
}

const HINT = 'Logged foods, largest contribution first'

function foodDetail(logs: NutritionLogEntry[]): string {
  if (logs.length === 1) {
    const [log] = logs
    return [nutritionMealGroup(log.mealType), formatClock(log.startTime), log.servingLabel].filter(Boolean).join(' · ')
  }
  const meals = new Set(logs.map((log) => nutritionMealGroup(log.mealType)))
  return `${NUTRITION_MEAL_GROUPS.filter((meal) => meals.has(meal)).join(', ')} · ${logs.length} logs`
}

function formatShare(share: number): string {
  if (share <= 0) return '0%'
  return share < 0.01 ? '<1%' : `${Math.round(share * 100)}%`
}

export function NutritionBreakdownPanel({
  metricKey,
  dayTotal,
  entries,
  pending,
  error
}: {
  metricKey: MetricKey
  dayTotal: number | null
  entries?: NutritionLogEntry[]
  pending: boolean
  error: boolean
}): React.JSX.Element | null {
  const key = NUTRITION_BREAKDOWN_KEYS[metricKey]
  if (!key) return null
  if (pending) return <NutritionBreakdownSkeleton />

  const def = METRICS[metricKey]
  const isSodium = metricKey === 'sodiumG'
  const formatAmount = (value: number): string =>
    isSodium ? value.toFixed(2) : value < 1 ? value.toFixed(1) : def.format(value)
  const tolerance = Math.max((dayTotal ?? 0) * 0.01, isSodium ? 0.01 : 1)
  const breakdown = nutritionBreakdown(entries ?? [], key, dayTotal, tolerance)
  const label = def.label.toLowerCase()

  return (
    <Panel className={`flex flex-col gap-3 p-5 ${CARD_HEIGHT.list}`}>
      <SectionHeader title="Breakdown" hint={HINT} />
      {error ? (
        <EmptyMessage>Food logs could not be loaded for this day.</EmptyMessage>
      ) : !entries?.length && breakdown.unattributed == null ? (
        <EmptyMessage>No foods logged for this day.</EmptyMessage>
      ) : breakdown.items.length === 0 && breakdown.unattributed == null ? (
        <EmptyMessage>None of this day’s logged foods recorded {label}.</EmptyMessage>
      ) : (
        <div className="-mx-5 divide-y divide-hairline border-t border-hairline">
          {breakdown.items.map(({ foodName, entries: logs, value, share }) => (
            <BreakdownRow
              key={logs[0].id}
              name={foodName}
              detail={foodDetail(logs)}
              amount={formatAmount(value)}
              unit={def.unit}
              share={share}
              color={def.color}
            />
          ))}
          {breakdown.unattributed != null && (
            <BreakdownRow
              name="Other"
              detail="In the day’s total but not in individual food logs"
              amount={formatAmount(breakdown.unattributed)}
              unit={def.unit}
              share={breakdown.unattributedShare}
              color="var(--color-ink-faint)"
              muted
            />
          )}
          {breakdown.emptyCount > 0 && (
            <div className="px-5 pt-3 text-[11px] text-ink-faint">
              {breakdown.emptyCount} other {breakdown.emptyCount === 1 ? 'food' : 'foods'} with no {label} recorded
            </div>
          )}
        </div>
      )}
    </Panel>
  )
}

function BreakdownRow({
  name,
  detail,
  amount,
  unit,
  share,
  color,
  muted = false
}: {
  name: string
  detail: string
  amount: string
  unit: string
  share: number
  color: string
  muted?: boolean
}): React.JSX.Element {
  return (
    <div className="px-5 py-3">
      <div className="flex items-baseline justify-between gap-4">
        <div className="min-w-0">
          <div className={`truncate text-[12.5px] font-medium ${muted ? 'text-ink-dim' : 'text-ink'}`}>{name}</div>
          <div className="mt-0.5 truncate text-[10.5px] text-ink-faint">{detail}</div>
        </div>
        <div className="shrink-0 whitespace-nowrap text-right">
          <span className="font-mono text-[13px] font-medium text-ink">{amount}</span>{' '}
          <span className="text-[9.5px] text-ink-dim">{unit}</span>
          <div className="mt-0.5 font-mono text-[10.5px] text-ink-faint">{formatShare(share)}</div>
        </div>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.04]">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.min(share, 1) * 100}%`, background: color }}
        />
      </div>
    </div>
  )
}

function EmptyMessage({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="grid min-h-[168px] place-items-center px-5 text-center text-[13px] text-ink-faint">
      {children}
    </div>
  )
}

export function NutritionBreakdownSkeleton(): React.JSX.Element {
  return (
    <Panel className={`flex flex-col gap-3 p-5 ${CARD_HEIGHT.list}`} aria-hidden>
      <SectionHeader title="Breakdown" hint={HINT} />
      <div className="-mx-5 divide-y divide-hairline border-t border-hairline">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="px-5 py-3">
            <div className="flex justify-between gap-4">
              <div className="flex flex-col gap-1.5">
                <SkeletonText className="w-36" />
                <SkeletonText className="w-24" />
              </div>
              <SkeletonText className="h-4 w-14" />
            </div>
            <SkeletonBlock className="mt-2 h-1 w-full rounded-full" />
          </div>
        ))}
      </div>
    </Panel>
  )
}
