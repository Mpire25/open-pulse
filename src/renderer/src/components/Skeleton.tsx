import { cn } from '@/lib/utils'

/** Loading placeholder matched to the Panel radius; size via className. */
export function Skeleton({ className }: { className?: string }): React.JSX.Element {
  return <div className={cn('animate-pulse rounded-[22px] bg-white/[0.045]', className)} />
}
