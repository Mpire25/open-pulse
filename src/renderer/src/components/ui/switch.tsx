import * as SwitchPrimitive from '@radix-ui/react-switch'
import { cn } from '@/lib/utils'

export function Switch({
  className,
  ...props
}: SwitchPrimitive.SwitchProps): React.JSX.Element {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'relative h-6 w-10 shrink-0 rounded-full border border-transparent bg-white/12 transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-accent/60 data-[state=checked]:bg-[#30d158]',
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.4)] transition-transform duration-200 data-[state=checked]:translate-x-[18px]" />
    </SwitchPrimitive.Root>
  )
}
