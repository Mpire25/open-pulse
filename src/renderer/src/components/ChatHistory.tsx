import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { ChatsCircle, PushPin, PushPinSlash, Trash } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import type { ChatController } from '@/hooks/useChat'
import type { ChatSession } from '@shared/types'
import { cn } from '@/lib/utils'

interface ChatHistoryProps {
  chat: ChatController
  onNavigate?: () => void
  onDeleteDialogClose?: () => void
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

function dateGroupLabel(value: string, now: Date): string {
  const startOfDay = (input: Date): number =>
    new Date(input.getFullYear(), input.getMonth(), input.getDate()).getTime()
  const dayDiff = Math.floor((startOfDay(now) - startOfDay(new Date(value))) / 86_400_000)
  if (dayDiff <= 0) return 'Today'
  if (dayDiff === 1) return 'Yesterday'
  if (dayDiff < 7) return 'Previous 7 days'
  if (dayDiff < 30) return 'Previous 30 days'
  return 'Older'
}

interface SessionGroup {
  label: string
  sessions: ChatSession[]
}

/** Pinned chats first, then recency buckets; sessions arrive newest-first. */
function groupSessions(sessions: ChatSession[]): SessionGroup[] {
  const now = new Date()
  const groups: SessionGroup[] = []
  const pinned = sessions.filter((session) => session.pinned)
  if (pinned.length) groups.push({ label: 'Pinned', sessions: pinned })
  for (const session of sessions.filter((candidate) => !candidate.pinned)) {
    const label = dateGroupLabel(session.updatedAt, now)
    const group = groups[groups.length - 1]
    if (group && group.label === label) group.sessions.push(session)
    else groups.push({ label, sessions: [session] })
  }
  return groups
}

export function ChatHistory({ chat, onNavigate, onDeleteDialogClose }: ChatHistoryProps): React.JSX.Element {
  const [deleteTarget, setDeleteTarget] = useState<ChatSession | null>(null)

  const closeDeleteDialog = (): void => {
    setDeleteTarget(null)
    onDeleteDialogClose?.()
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 pt-1">
        {chat.sessions.length ? (
          groupSessions(chat.sessions).map((group) => (
            <div key={group.label}>
              <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
                {group.label}
              </p>
              <div className="flex flex-col gap-0.5">
                {group.sessions.map((session) => (
                  <SessionRow
                    key={session.id}
                    session={session}
                    selected={session.id === chat.activeChatId}
                    streaming={chat.streamingChatIds.includes(session.id)}
                    onSelect={() => {
                      chat.select(session.id)
                      onNavigate?.()
                    }}
                    onPin={() => void chat.pin(session.id, !session.pinned)}
                    onDelete={() => setDeleteTarget(session)}
                  />
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="flex flex-col items-center gap-2 px-3 py-8 text-center">
            <ChatsCircle size={20} className="text-ink-faint" />
            <p className="text-[11.5px] leading-snug text-ink-faint">
              Conversations you start
              <br />
              will appear here
            </p>
          </div>
        )}
      </div>

      <Dialog.Root open={deleteTarget != null} onOpenChange={(open) => !open && closeDeleteDialog()}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/55 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(380px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-hairline bg-panel p-5 shadow-2xl outline-none">
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
                  void chat.delete(deleteTarget.id).then(closeDeleteDialog)
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

interface SessionRowProps {
  session: ChatSession
  selected: boolean
  streaming: boolean
  onSelect: () => void
  onPin: () => void
  onDelete: () => void
}

function SessionRow({ session, selected, streaming, onSelect, onPin, onDelete }: SessionRowProps): React.JSX.Element {
  return (
    <div
      className={cn(
        'group relative flex w-full items-center rounded-[10px] border text-left transition-colors',
        selected
          ? 'border-hairline bg-white/[0.065] text-ink'
          : 'border-transparent text-ink-dim hover:bg-white/[0.035] hover:text-ink'
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-[10px] px-3 py-2.5 pr-14 text-left outline-none focus-visible:ring-1 focus-visible:ring-accent/50"
      >
        {streaming && <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-accent" />}
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{session.title}</span>
      </button>
      {/* Positioned outside the button so it never reflows when the hover
          actions replace it — it just fades in place. */}
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[9.5px] tabular-nums text-ink-faint transition-opacity group-hover:opacity-0 group-focus-within:opacity-0">
        {relativeTime(session.updatedAt)}
      </span>
      <div className="pointer-events-none absolute right-1 flex items-center opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
        <button
          type="button"
          title={session.pinned ? 'Unpin chat' : 'Pin chat'}
          aria-label={`${session.pinned ? 'Unpin' : 'Pin'} ${session.title}`}
          onClick={onPin}
          className="grid size-7 place-items-center rounded-lg text-ink-faint transition-colors hover:bg-white/[0.08] hover:text-ink"
        >
          {session.pinned ? <PushPinSlash size={13} /> : <PushPin size={13} />}
        </button>
        <button
          type="button"
          title="Delete chat"
          aria-label={`Delete ${session.title}`}
          onClick={onDelete}
          className="grid size-7 place-items-center rounded-lg text-ink-faint transition-colors hover:bg-danger/10 hover:text-danger"
        >
          <Trash size={13} />
        </button>
      </div>
    </div>
  )
}
