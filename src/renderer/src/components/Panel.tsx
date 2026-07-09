import { forwardRef, type HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

// The base surface used across the app: soft panel, hairline border, tinted
// diffusion shadow. Deliberately not a generic drop-shadow card.
export const Panel = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-[22px] border border-hairline bg-panel/80 shadow-[0_20px_50px_-30px_rgb(0_0_0/0.8)] backdrop-blur-xl',
        className
      )}
      {...props}
    />
  )
)
Panel.displayName = 'Panel'

interface SectionHeaderProps {
  title: string
  hint?: string
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
