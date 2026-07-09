import { memo } from 'react'
import { motion } from 'framer-motion'

export interface RingSpec {
  key: string
  label: string
  value: number
  goal: number
  color: string
  trackColor: string
  unit: string
}

interface ActivityRingsProps {
  rings: RingSpec[]
  size?: number
  strokeWidth?: number
  gap?: number
  showGlow?: boolean
}

// Concentric progress rings in the Apple Fitness idiom: rounded caps, a faint
// track, and an over-1.0 fraction that keeps sweeping past the start.
function ActivityRingsBase({
  rings,
  size = 220,
  strokeWidth = 20,
  gap = 6,
  showGlow = true
}: ActivityRingsProps): React.JSX.Element {
  const center = size / 2

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
      <defs>
        {showGlow && (
          <filter id="ring-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        )}
      </defs>
      {rings.map((ring, i) => {
        const radius = center - strokeWidth / 2 - i * (strokeWidth + gap)
        if (radius <= 0) return null
        const circumference = 2 * Math.PI * radius
        const fraction = Math.min(ring.value / ring.goal, 1)
        const overshoot = ring.value / ring.goal > 1
        return (
          <g key={ring.key} transform={`rotate(-90 ${center} ${center})`}>
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={ring.trackColor}
              strokeWidth={strokeWidth}
            />
            <motion.circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={ring.color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              filter={showGlow && overshoot ? 'url(#ring-glow)' : undefined}
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset: circumference * (1 - fraction) }}
              transition={{ duration: 1.1, delay: 0.15 + i * 0.12, ease: [0.16, 1, 0.3, 1] }}
            />
          </g>
        )
      })}
    </svg>
  )
}

export const ActivityRings = memo(ActivityRingsBase)
