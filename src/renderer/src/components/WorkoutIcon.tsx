import {
  Barbell,
  Bicycle,
  Lightning,
  PersonSimple,
  PersonSimpleRun,
  PersonSimpleSwim,
  PersonSimpleTaiChi,
  PersonSimpleWalk,
  Racquet,
  SneakerMove,
  SoccerBall,
  TennisBall,
  type Icon,
  type IconProps
} from '@phosphor-icons/react'
import { workoutTone, type WorkoutColorKey } from '@/lib/workouts'
import type { Workout } from '@shared/types'

const WORKOUT_ICONS: Record<WorkoutColorKey, Icon> = {
  walking: PersonSimpleWalk,
  running: PersonSimpleRun,
  strength: Barbell,
  cycling: Bicycle,
  swimming: PersonSimpleSwim,
  mobility: PersonSimpleTaiChi,
  cardio: Lightning,
  tennis: TennisBall,
  badminton: Racquet,
  football: SoccerBall,
  treadmill: SneakerMove,
  other: PersonSimple
}

interface WorkoutIconProps extends Omit<IconProps, 'color'> {
  workout: Workout | string
  color?: string
}

export function WorkoutIcon({ color, weight = 'fill', workout, ...props }: WorkoutIconProps): React.JSX.Element {
  const tone = workoutTone(workout)
  const Icon = WORKOUT_ICONS[tone.key]
  return <Icon {...props} color={color ?? tone.color} weight={weight} />
}
