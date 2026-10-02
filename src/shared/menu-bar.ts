import { METRIC_KEYS } from './types'
export const MENU_BAR_VIEWS = ['home', 'activity', 'heart', 'sleep', 'body', 'nutrition', 'devices', 'settings'] as const
export const MENU_BAR_METRICS = METRIC_KEYS
export interface MenuBarDestination {
  view: typeof MENU_BAR_VIEWS[number]
  date: string
  metric?: typeof MENU_BAR_METRICS[number]
  range?: 'D' | 'W' | 'M'
  customize?: 'menuBar'
}

export function isMenuBarDestination(value: unknown): value is MenuBarDestination {
  if (!value || typeof value !== 'object') return false
  const v = value as MenuBarDestination
  const date = typeof v.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.date) ? new Date(`${v.date}T12:00:00Z`) : null
  return MENU_BAR_VIEWS.includes(v.view) && date !== null && Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === v.date &&
    (v.metric === undefined || MENU_BAR_METRICS.includes(v.metric)) &&
    (v.range === undefined || v.range === 'D' || v.range === 'W' || v.range === 'M') &&
    (v.customize === undefined || (v.customize === 'menuBar' && v.view === 'settings' && v.metric === undefined))
}

/** Keep the panel within the display containing the tray, including small displays. */
export function menuBarBounds(anchor: { x: number; y: number; width: number; height: number }, area: { x: number; y: number; width: number; height: number }, contentHeight = 650): { x: number; y: number; width: number; height: number } {
  const width = Math.min(452, area.width)
  const height = Math.min(Math.max(1, Math.ceil(contentHeight)), area.height)
  return {
    width, height,
    x: Math.round(Math.max(area.x, Math.min(anchor.x + anchor.width / 2 - width / 2, area.x + area.width - width))),
    y: Math.round(Math.max(area.y, Math.min(anchor.y + anchor.height + 6, area.y + area.height - height)))
  }
}
