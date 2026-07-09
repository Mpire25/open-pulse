interface ErrorStateProps {
  message?: string
  onRetry: () => void
}

export function ErrorState({ message, onRetry }: ErrorStateProps): React.JSX.Element {
  return (
    <div className="grid h-full min-h-[320px] place-items-center px-8">
      <div className="max-w-sm text-center">
        <h2 className="text-[15px] font-semibold text-ink">Couldn’t load your data</h2>
        <p className="mt-2 text-[13px] text-ink-dim">
          {message ?? 'Google Health didn’t answer. Check the connection in Settings, then try again.'}
        </p>
        <button
          onClick={onRetry}
          className="mt-4 rounded-full bg-panel-2 px-4 py-2 text-[13px] text-ink transition-colors hover:bg-white/10"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
