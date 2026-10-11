import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@fontsource-variable/archivo'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import App from './App'
import MenuBarDashboard from './views/MenuBarDashboard'
import './globals.css'
import { initializeAppearance } from '@/lib/appearance'

// One retry only: the main process already retries 429s with backoff, and
// stale data from its archive beats hammering a failing endpoint.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      gcTime: 30 * 60_000
    }
  }
})

// Each window owns a query cache. Refreshes from another window mark even
// disabled queries stale; they fetch when the popup becomes visible again.
window.pulse.health.onInvalidated(() => { void queryClient.invalidateQueries() })

async function bootstrap(): Promise<void> {
  // Resolve the theme independently of account initialization and before the first render.
  try {
    const stopAppearance = await initializeAppearance()
    window.addEventListener('unload', stopAppearance, { once: true })
  } catch (error) {
    console.error('Could not load appearance; using dark mode.', error)
  }
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        {window.location.hash === '#menu-bar' ? <MenuBarDashboard /> : <App />}
      </QueryClientProvider>
    </React.StrictMode>
  )
}

void bootstrap()
