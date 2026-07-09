import { motion } from 'framer-motion'
import { GoogleSetup } from '@/components/GoogleSetup'
import { cn } from '@/lib/utils'
import type { GoogleAuthStatus } from '@shared/types'

interface ConnectGateProps {
  connected: boolean
  clientId: string
  clientSecretConfigured: boolean
  onConnected: (status: GoogleAuthStatus) => void
  onCredentialsChange: (clientId: string, clientSecretConfigured: boolean) => void
  children: React.ReactNode
}

// While Google Health is not connected, the page still renders its demo data
// underneath — dimmed and non-interactive — with the setup panel floating over
// it, so the user sees a live preview of what they're setting up.
export function ConnectGate({
  connected,
  clientId,
  clientSecretConfigured,
  onConnected,
  onCredentialsChange,
  children
}: ConnectGateProps): React.JSX.Element {
  return (
    <div className="relative h-full">
      <div
        className={cn('h-full transition-[filter] duration-500', !connected && 'pointer-events-none select-none')}
        aria-hidden={!connected}
      >
        {children}
      </div>

      {!connected && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="absolute inset-0 z-30 overflow-y-auto bg-canvas/55 backdrop-blur-[3px]"
        >
          <div className="grid min-h-full place-items-center px-6 py-10">
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.06, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="no-drag w-full max-w-[420px] rounded-[22px] border border-hairline bg-panel/95 p-6 shadow-[0_40px_100px_-40px_rgb(0_0_0/0.9)] backdrop-blur-2xl"
            >
              <GoogleSetup
                initialClientId={clientId}
                clientSecretConfigured={clientSecretConfigured}
                onConnected={onConnected}
                onCredentialsChange={onCredentialsChange}
              />
            </motion.div>
          </div>
        </motion.div>
      )}
    </div>
  )
}
