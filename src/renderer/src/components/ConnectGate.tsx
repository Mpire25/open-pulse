import { motion } from 'framer-motion'
import { GoogleSetup } from '@/components/GoogleSetup'
import type { GoogleAuthStatus } from '@shared/types'

interface ConnectGateProps {
  connected: boolean
  clientId: string
  clientSecretConfigured: boolean
  onConnected: (status: GoogleAuthStatus) => void
  onCredentialsChange: (clientId: string, clientSecretConfigured: boolean) => void
  children: React.ReactNode
}

export function ConnectGate({
  connected,
  clientId,
  clientSecretConfigured,
  onConnected,
  onCredentialsChange,
  children
}: ConnectGateProps): React.JSX.Element {
  if (connected) return <div className="h-full">{children}</div>

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="grid min-h-full place-items-center bg-canvas px-6 py-10"
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.04, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="no-drag w-full max-w-[420px] rounded-[22px] border border-hairline bg-panel/95 p-6 shadow-[0_40px_100px_-40px_rgb(0_0_0/0.9)] backdrop-blur-2xl"
      >
        <GoogleSetup
          initialClientId={clientId}
          clientSecretConfigured={clientSecretConfigured}
          onConnected={onConnected}
          onCredentialsChange={onCredentialsChange}
        />
      </motion.div>
    </motion.div>
  )
}
