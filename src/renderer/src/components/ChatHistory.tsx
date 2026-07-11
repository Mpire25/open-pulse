import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Trash } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import type { ChatController } from '@/hooks/useChat'
import type { ChatSession } from '@shared/types'
import { cn } from '@/lib/utils'

interface ChatHistoryProps {
  chat: ChatController
  compact?: boolean
  onNavigate?: () => void
}

function relativeTime(value: string): string {
  const date = new Date(value)
  const elapsed = Date.now() - date.getTime()
  if (elapsed < 60_000) return 'Now'
  if (elapsed < 60 * 60_000) return `${Math.max(1, Math.floor(elapsed / 60_000))}m`
  if (elapsed < 24 * 60 * 60_000) return `${Math.floor(elapsed / (60 * 60_000))}h`
  if (elapsed < 7 * 24 * 60 * 60_000) return `${Math.floor(elapsed / (24 * 60 * 60_000))}d`
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(date)
}

export function ChatHistory({ chat, compact, onNavigate }: ChatHistoryProps): React.JSX.Element {
  const [deleteTarget, setDeleteTarget] = useState<ChatSession | null>(null)

  return (
    <div className="flex h-full min-h-0 flex-col">
      {!compact && (
        <div className="flex h-10 shrink-0 items-center px-3">
          <span className="display text-[13px] font-semibold text-ink">Chats</span>
        </div>
      )}

      <div className={cn('min-h-0 flex-1 overflow-y-auto px-2 pb-3', compact ? 'pt-2' : 'pt-1')}>
        {chat.sessions.length ? (
          <div className="flex flex-col gap-0.5">
            {chat.sessions.map((session) => {
              const selected = session.id === chat.activeChatId
              const streaming = chat.streamingChatIds.includes(session.id)
              return (
                <div
                  key={session.id}
                  className={cn(
                    'group relative flex w-full items-center rounded-[10px] border text-left transition-colors',
                    selected
                      ? 'border-hairline bg-white/[0.065] text-ink'
                      : 'border-transparent text-ink-dim hover:bg-white/[0.035] hover:text-ink'
                  )}
                >
                  <button
                    type="button"
                    onClick={() => {
                      chat.select(session.id)
                      onNavigate?.()
                    }}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-[10px] px-3 py-2.5 pr-10 text-left outline-none focus-visible:ring-1 focus-visible:ring-accent/50"
                  >
                    {streaming && <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-accent" />}
                    <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{session.title}</span>
                    <span className="shrink-0 text-[9.5px] tabular-nums text-ink-faint transition-opacity group-hover:opacity-0 group-focus-within:opacity-0">
                      {relativeTime(session.updatedAt)}
                    </span>
                  </button>
                  <button
                    type="button"
                    title="Delete chat"
                    aria-label={`Delete ${session.title}`}
                    onClick={() => setDeleteTarget(session)}
                    className="pointer-events-none absolute right-1.5 grid size-7 place-items-center rounded-lg text-ink-faint opacity-0 transition-colors hover:bg-danger/10 hover:text-danger group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
                  >
                    <Trash size={13} />
                  </button>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="px-3 py-5 text-[11px] text-ink-faint">No chats yet</p>
        )}
      </div>

      <Dialog.Root open={deleteTarget != null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/55 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 w-[min(380px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-hairline bg-panel p-5 shadow-2xl outline-none">
            <Dialog.Title className="display text-[16px] font-semibold text-ink">Delete chat?</Dialog.Title>
            <Dialog.Description className="mt-2 text-[12.5px] leading-relaxed text-ink-dim">
              “{deleteTarget?.title}” will be permanently deleted. This cannot be undone.
            </Dialog.Description>
            <div className="mt-5 flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button variant="ghost" size="sm">Cancel</Button>
              </Dialog.Close>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (!deleteTarget) return
                  void chat.delete(deleteTarget.id).then(() => setDeleteTarget(null))
                }}
              >
                <Trash size={13} /> Delete
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
