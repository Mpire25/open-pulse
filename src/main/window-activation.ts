interface ActivationApp {
  on(event: 'activate' | 'second-instance', listener: () => void): unknown
  whenReady(): Promise<unknown>
}
interface ActivatableWindow {
  isMinimized(): boolean
  restore(): void
  show(): void
  focus(): void
}

/** Both Dock activation and a second launch reveal the primary app window. */
export function installWindowActivation(
  app: ActivationApp,
  getWindow: () => ActivatableWindow
): void {
  const reveal = (): void => {
    void app.whenReady().then(() => {
      const window = getWindow()
      if (window.isMinimized()) window.restore()
      window.show()
      window.focus()
    })
  }
  app.on('activate', reveal)
  app.on('second-instance', reveal)
}
