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

type InteractivePanelProps = Omit<HTMLAttributes<HTMLDivElement>, 'onClick'> & {
  onOpen: () => void
}

/** A single-destination panel whose entire surface is the navigation target. */
export const InteractivePanel = forwardRef<HTMLDivElement, InteractivePanelProps>(
  ({ className, onOpen, onKeyDown, ...props }, ref) => (
    <Panel
      ref={ref}
      {...props}
      role="button"
      tabIndex={0}
      className={cn(
        'group/drill cursor-pointer transition-[background-color,border-color,box-shadow,transform] hover:border-hairline-strong hover:bg-panel-2/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 active:translate-y-px',
        className
      )}
      onClick={onOpen}
      onKeyDown={(event) => {
        onKeyDown?.(event)
        if (event.defaultPrevented) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen()
        }
      }}
    />
  )
)
InteractivePanel.displayName = 'InteractivePanel'

type DrillPanelProps = HTMLAttributes<HTMLDivElement> & {
  onOpen: () => void
  label: string
  contentClassName?: string
}

/** A drill-in panel that can also contain independent interactive controls. */
export const DrillPanel = forwardRef<HTMLDivElement, DrillPanelProps>(
  ({ children, className, contentClassName, label, onOpen, ...props }, ref) => (
    <Panel
      ref={ref}
      {...props}
      className={cn(
        'group/drill relative cursor-pointer transition-[background-color,border-color,box-shadow,transform] hover:border-hairline-strong hover:bg-panel-2/60 active:translate-y-px',
        className
      )}
    >
      <button
        type="button"
        aria-label={label}
        onClick={onOpen}
        className="absolute inset-0 rounded-[22px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      />
      <div className={cn('pointer-events-none relative z-10', contentClassName)}>{children}</div>
    </Panel>
  )
)
DrillPanel.displayName = 'DrillPanel'

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
  /** When omitted, the surrounding InteractivePanel owns the navigation. */
  onOpen?: () => void
}

/** Card header that drills into a detail page — the "›" affordance. */
export function DrillHeader({ title, hint, icon, action, onOpen }: DrillHeaderProps): React.JSX.Element {
  const content = (
    <>
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
          className="text-ink-faint transition-all group-hover/drill:translate-x-0.5 group-hover/drill:text-ink"
        />
      </div>
    </>
  )

  return onOpen ? (
    <button
      type="button"
      onClick={onOpen}
      className="group/drill -mx-2 -my-1 flex w-[calc(100%+1rem)] items-center justify-between gap-3 rounded-xl px-2 py-1 text-left transition-colors hover:bg-white/[0.04]"
    >
      {content}
    </button>
  ) : (
    <div className="flex items-center justify-between gap-3">{content}</div>
  )
}
