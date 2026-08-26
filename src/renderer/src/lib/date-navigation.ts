export interface DateNavigationState {
  showTodayShortcut: boolean
  canGoForward: boolean
}

/** Keep the viewed date stable while exposing a route back to the current day. */
export function dateNavigationState(date: string, today: string): DateNavigationState {
  return {
    showTodayShortcut: date !== today,
    canGoForward: date < today
  }
}
