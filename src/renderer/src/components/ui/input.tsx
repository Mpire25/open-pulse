import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-8.5 w-full rounded-lg border border-hairline bg-black/25 px-3 text-[13px] text-ink placeholder:text-ink-faint outline-none transition-colors focus:border-accent/70 focus:ring-2 focus:ring-accent/25 select-text',
        className
      )}
      {...props}
    />
  )
)
Input.displayName = 'Input'
