export const APPEARANCE_MODES = ['light', 'dark', 'system'] as const
export type AppearanceMode = (typeof APPEARANCE_MODES)[number]
export type ResolvedAppearance = Exclude<AppearanceMode, 'system'>

export interface AppearanceState {
  mode: AppearanceMode
  resolved: ResolvedAppearance
}

export function isAppearanceMode(value: unknown): value is AppearanceMode {
  return typeof value === 'string' && (APPEARANCE_MODES as readonly string[]).includes(value)
}

export function normalizeAppearance(value: unknown): AppearanceMode {
  return isAppearanceMode(value) ? value : 'dark'
}

export const APPEARANCE_CANVAS: Record<ResolvedAppearance, string> = {
  dark: '#0e0f12',
  light: '#f3f4f8'
}
