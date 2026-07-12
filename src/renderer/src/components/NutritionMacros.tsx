import { formatInt } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { AssistantNutritionValues } from '@shared/types'

const MACROS = [
  { key: 'proteinG' as const, label: 'Protein', kcalPerG: 4, color: 'var(--color-recovery)' },
  { key: 'carbsG' as const, label: 'Carbs', kcalPerG: 4, color: 'var(--color-activity)' },
  { key: 'fatG' as const, label: 'Fat', kcalPerG: 9, color: 'var(--color-heart)' }
]

export function NutritionMacroBar({
  values,
  compact = false,
  className
}: {
  values: Pick<AssistantNutritionValues, 'proteinG' | 'carbsG' | 'fatG'>
  compact?: boolean
  className?: string
}): React.JSX.Element {
  const parts = MACROS.map((macro) => ({
    ...macro,
    grams: values[macro.key] ?? 0,
    kcal: (values[macro.key] ?? 0) * macro.kcalPerG
  }))
  const total = parts.reduce((sum, part) => sum + part.kcal, 0)
  const ariaLabel = parts
    .filter((part) => part.grams > 0)
    .map((part) => `${part.label} ${formatInt(part.grams)} grams`)
    .join(', ')
  return (
    <div
      className={cn('flex overflow-hidden rounded-full bg-white/[0.04]', compact ? 'h-1' : 'h-2', className)}
      role="img"
      aria-label={ariaLabel || 'No macro details'}
    >
      {total > 0 && parts.map((part) => part.kcal > 0 ? (
        <span
          key={part.key}
          style={{ width: `${(part.kcal / total) * 100}%`, background: part.color }}
        />
      ) : null)}
    </div>
  )
}

export function NutritionMacroTotal({
  label,
  value,
  color
}: {
  label: string
  value: number | null
  color: string
}): React.JSX.Element | null {
  if (value == null) return null
  return (
    <span className="flex items-center gap-1.5 text-[10.5px] text-ink-faint">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {label} <span className="font-mono text-ink-dim">{formatInt(value)}g</span>
    </span>
  )
}
