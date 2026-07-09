import { useId } from 'react'
import { cn } from '@/lib/utils'

interface AppLogoProps {
  size?: number
  className?: string
}

// Heart sized to fill most of the tile (spans ~x3–37, y5–34 of the 40 viewBox).
const HEART =
  'M20 33.9 C10.2 25.5 3.2 19.8 3.2 13 C3.2 8.4 6.8 5.1 11.1 5.1 C14.7 5.1 17.8 7.5 20 11 C22.2 7.5 25.3 5.1 28.9 5.1 C33.2 5.1 36.8 8.4 36.8 13 C36.8 19.8 29.8 25.5 20 33.9 Z'
// ECG pulse carved across the heart's mid-line.
const PULSE = 'M4.4 18.6 H13.4 L16.2 18.6 L18.6 11.4 L21.7 26 L24.1 15.7 L25.9 18.6 H35.6'

// App mark: a solid white heart on the warm crimson tile, with a pulse/ECG line
// knocked out of it so the red shows through the cut. Custom-drawn, not a stock glyph.
export function AppLogo({ size = 28, className }: AppLogoProps): React.JSX.Element {
  const maskId = useId()
  return (
    <div
      className={cn('relative grid shrink-0 place-items-center overflow-hidden', className)}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        background: 'linear-gradient(145deg, #ff4d68 0%, #e11d48 54%, #be123c 100%)',
        boxShadow:
          'inset 0 0.5px 0 rgb(255 255 255 / 0.35), inset 0 0 0 0.5px rgb(255 255 255 / 0.08), 0 6px 16px -6px rgb(190 18 60 / 0.6)'
      }}
    >
      <svg
        width={size * 0.82}
        height={size * 0.82}
        viewBox="0 0 40 40"
        fill="none"
        style={{ filter: 'drop-shadow(0 1px 1.5px rgb(136 8 33 / 0.4))' }}
      >
        <mask id={maskId} maskUnits="userSpaceOnUse">
          <rect width="40" height="40" fill="black" />
          <path d={HEART} fill="white" />
          <path
            d={PULSE}
            stroke="black"
            strokeWidth={3.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </mask>
        <rect width="40" height="40" fill="#fff" mask={`url(#${maskId})`} />
      </svg>
    </div>
  )
}
