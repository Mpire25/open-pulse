import { BrowserWindow, Menu, type MenuItemConstructorOptions, type WebContents } from 'electron'
import {
  DASHBOARD_SLOTS,
  DASHBOARD_TREND_PERIODS,
  isDashboardWidget,
  widgetId,
  widgetOptions,
  type DashboardWidget
} from '../shared/dashboard'
import { METRIC_DESCRIPTIONS } from '../shared/metric-descriptions'

const pending = new Map<number, () => void>()

/** A native picker changes the renderer's draft; persistence still requires Save. */
export function chooseDashboardWidget(
  sender: WebContents,
  surface: unknown,
  slotId: unknown,
  current: unknown,
  anchor: unknown
): Promise<DashboardWidget | null> {
  if (surface !== 'home' && surface !== 'menuBar') throw new Error('Unknown dashboard surface.')
  const slot = DASHBOARD_SLOTS[surface].find((entry) => entry.id === slotId)
  if (!slot || !isDashboardWidget(current, slot.kind, surface))
    throw new Error('Invalid dashboard slot or widget.')
  const window = BrowserWindow.fromWebContents(sender)
  if (!window || window.isDestroyed()) throw new Error('Dashboard window is unavailable.')
  const point = anchor as { x?: unknown; y?: unknown } | null
  if (
    !point ||
    typeof point.x !== 'number' ||
    typeof point.y !== 'number' ||
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y)
  )
    throw new Error('Invalid menu position.')
  const [width, height] = window.getContentSize()
  const x = Math.max(0, Math.min(width - 1, Math.round(point.x)))
  const y = Math.max(0, Math.min(height - 1, Math.round(point.y)))
  const senderId = sender.id
  pending.get(senderId)?.()
  return new Promise((resolve, reject) => {
    let menu: Menu
    let settled = false
    const finish = (widget: DashboardWidget | null, error?: unknown): void => {
      if (settled) return
      settled = true
      pending.delete(senderId)
      sender.removeListener('destroyed', dismiss)
      window.removeListener('closed', dismiss)
      if (error) reject(error)
      else resolve(widget)
    }
    const dismiss = (): void => {
      finish(null)
      if (!window.isDestroyed()) menu.closePopup(window)
    }
    const groups = new Map<string, MenuItemConstructorOptions[]>()
    for (const widget of widgetOptions(slot.kind, surface)) {
      const description = 'metric' in widget ? METRIC_DESCRIPTIONS[widget.metric] : null
      const group = description?.domain ?? (widget.kind === 'sleepStages' ? 'sleep' : 'other')
      const label = widget.kind === 'trend'
        ? DASHBOARD_TREND_PERIODS.find(period => period.days === widget.days)!.label
        : widget.kind === 'intraday' ? '1 day'
        : description?.label ?? (widget.kind === 'sleepStages' ? 'Sleep stages' : 'Workouts')
      const entries = groups.get(group) ?? []
      const option: MenuItemConstructorOptions = {
        id: widgetId(widget),
        label,
        type: 'checkbox',
        checked: widgetId(widget) === widgetId(current),
        click: () => finish(widget)
      }
      if (description && (widget.kind === 'trend' || widget.kind === 'intraday')) {
        const id = `metric:${widget.metric}`
        let metricMenu = entries.find(entry => entry.id === id)
        if (!metricMenu) {
          metricMenu = { id, label: widget.metric === 'restingHeartRate' ? 'Heart rate' : description.label, submenu: [] }
          entries.push(metricMenu)
        }
        const periods = metricMenu.submenu as MenuItemConstructorOptions[]
        periods.push(option)
      } else entries.push(option)
      groups.set(group, entries)
    }
    const template: MenuItemConstructorOptions[] = slot.kind === 'goal'
      ? Array.from(groups.values()).flat()
      : Array.from(groups, ([group, submenu]) => group === 'other'
          ? submenu
          : [{ label: group[0].toUpperCase() + group.slice(1), submenu }]).flat()
    if (surface === 'menuBar' && slot.kind === 'chart' && current.kind !== 'hidden') {
      template.push(
        { type: 'separator' },
        { id: 'remove-chart', label: 'Remove chart', click: () => finish({ kind: 'hidden' }) }
      )
    }
    menu = Menu.buildFromTemplate(template)
    pending.set(senderId, dismiss)
    sender.once('destroyed', dismiss)
    window.once('closed', dismiss)
    try {
      menu.popup({ window, x, y, callback: () => finish(null) })
    } catch (error) {
      finish(null, error)
    }
  })
}
