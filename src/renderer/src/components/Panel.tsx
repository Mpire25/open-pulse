import { forwardRef, type HTMLAttributes } from 'react'
import { CaretRight } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

// The base surface used across the app: soft panel, hairline border, tinted
// diffusion shadow. Opaque on purpose — translucent panels with backdrop blur
// forced repaints of everything behind them on every scrolled frame.
export const Panel = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-[22px] border border-hairline bg-panel shadow-[0_20px_50px_-30px_rgb(0_0_0/0.8)]',
        className
      )}
      {...props}
    />
  )
)
Panel.displayName = 'Panel'

interface SectionHeaderProps {
  title: string
  hint?: React.ReactNode
  icon?: React.ReactNode
  action?: React.ReactNode
}

export function SectionHeader({ title, hint, icon, action }: SectionHeaderProps): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        {icon && <span className="text-ink-dim">{icon}</span>}
        <div>
          <h3 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h3>
          {hint && <p className="mt-0.5 text-[12px] text-ink-faint">{hint}</p>}
        </div>
      </div>
      {action}
    </div>
  )
}

interface DrillHeaderProps extends SectionHeaderProps {
  /** Opens the metric's detail page; renders the whole header as a button with a chevron. */
  onOpen: () => void
}

/** Card header that drills into a detail page — the "›" affordance. */
export function DrillHeader({ title, hint, icon, action, onOpen }: DrillHeaderProps): React.JSX.Element {
  return (
    <button
      onClick={onOpen}
      className="group -mx-2 -my-1 flex items-center justify-between gap-3 rounded-xl px-2 py-1 text-left transition-colors hover:bg-white/[0.04]"
    >
      <div className="flex items-center gap-2.5">
        {icon && <span className="text-ink-dim">{icon}</span>}
        <div>
          <h3 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h3>
          {hint && <p className="mt-0.5 text-[12px] text-ink-faint">{hint}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {action}
        <CaretRight
          size={14}
          weight="bold"
          className="text-ink-faint transition-all group-hover:translate-x-0.5 group-hover:text-ink"
        />
      </div>
    </button>
  )
}
