import { cn } from '@/lib/utils'

/**
 * Shared panel geometry. Loaded cards and their loading states use the same
 * token so switching dates never causes the surrounding grid to jump.
 */
export const CARD_HEIGHT = {
  periodStats: 'min-h-[92px]',
  compact: 'min-h-28',
  summary: 'min-h-40',
  hero: 'min-h-56',
  chart: 'min-h-[250px]',
  large: 'min-h-[286px]',
  detail: 'min-h-[298px]',
  detailLarge: 'min-h-[312px]',
  device: 'min-h-[380px]'
} as const

/** Loading placeholder with the same surface treatment as a finished Panel. */
export function Skeleton({ className }: { className?: string }): React.JSX.Element {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn(
        'relative overflow-hidden rounded-[22px] border border-hairline bg-panel shadow-[0_20px_50px_-30px_rgb(0_0_0/0.8)]',
        className
      )}
    >
      <div className="absolute inset-0 animate-pulse bg-white/[0.045]" />
      <span className="sr-only">Loading</span>
    </div>
  )
}
