import type { PulseApi } from './index'

declare global {
  interface Window {
    pulse: PulseApi
  }
}

export {}
