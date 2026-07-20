interface BatteryIconProps {
  pct: number
  size?: number
  className?: string
}

export function clampBatteryPct(pct: number): number {
  if (!Number.isFinite(pct)) return 0
  return Math.max(0, Math.min(100, pct))
}

export function batteryColor(pct: number): string {
  const level = clampBatteryPct(pct)
  if (level > 50) return 'var(--color-recovery)'
  if (level > 20) return 'var(--color-activity)'
  return 'var(--color-danger)'
}

/** A battery glyph whose fill represents the actual charge, rather than a broad icon tier. */
export function BatteryIcon({ pct, size = 18, className }: BatteryIconProps): React.JSX.Element {
  const level = clampBatteryPct(pct)
  const color = batteryColor(level)

  return (
    <svg
      aria-hidden="true"
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ color }}
    >
      <rect
        x="3"
        y="4"
        width={(15 * level) / 100}
        height="8"
        rx="1.25"
        fill="currentColor"
      />
      <rect x="1" y="2" width="19" height="12" rx="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M22 6V10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
