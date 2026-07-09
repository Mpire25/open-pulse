import { memo } from 'react'
import { motion } from 'framer-motion'

interface ProgressRingProps {
  value: number
  goal?: number | null
  color: string
  trackColor: string
  size?: number
  strokeWidth?: number
  children?: React.ReactNode
}

// A single goal ring used for stat tiles.
function ProgressRingBase({
  value,
  goal,
  color,
  trackColor,
  size = 64,
  strokeWidth = 7,
  children
}: ProgressRingProps): React.JSX.Element {
  const center = size / 2
  const radius = center - strokeWidth / 2
  const circumference = 2 * Math.PI * radius
  const fraction = Math.min(goal && goal > 0 ? value / goal : 0, 1)

  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="overflow-visible">
        <g transform={`rotate(-90 ${center} ${center})`}>
          <circle cx={center} cy={center} r={radius} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
          <motion.circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: circumference * (1 - fraction) }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          />
        </g>
      </svg>
      {children && <div className="absolute inset-0 grid place-items-center">{children}</div>}
    </div>
  )
}

export const ProgressRing = memo(ProgressRingBase)
