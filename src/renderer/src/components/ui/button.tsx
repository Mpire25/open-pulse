import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 rounded-full font-medium transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:pointer-events-none disabled:opacity-40 active:scale-[0.97] select-none whitespace-nowrap',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-white hover:bg-[#2b95ff] shadow-[inset_0_1px_0_rgb(255_255_255/0.15)]',
        secondary: 'bg-panel-2 text-ink hover:bg-[#26262e] border border-hairline',
        ghost: 'text-ink-dim hover:text-ink hover:bg-white/5',
        destructive: 'bg-danger/15 text-danger hover:bg-danger/25'
      },
      size: {
        sm: 'h-7 px-3 text-[12px]',
        md: 'h-8.5 px-4 text-[13px]',
        lg: 'h-10 px-5 text-sm'
      }
    },
    defaultVariants: { variant: 'primary', size: 'md' }
  }
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  )
)
Button.displayName = 'Button'
