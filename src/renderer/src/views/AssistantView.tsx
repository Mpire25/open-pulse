import { Sparkle, Broom } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { ChatPanel, type ChatState } from '@/components/ChatPanel'
import type { CodexAuthStatus } from '@shared/types'

interface AssistantViewProps {
  chat: ChatState
  codex: CodexAuthStatus
  onOpenSettings: () => void
}

export function AssistantView({ chat, codex, onOpenSettings }: AssistantViewProps): React.JSX.Element {
  return (
    <div className="flex h-full w-full flex-col">
      <div className="mx-auto flex w-full max-w-[820px] items-center justify-between px-6 pb-2 pt-1">
        <div className="flex items-center gap-2">
          <div className="grid h-6 w-6 place-items-center rounded-lg bg-accent-soft">
            <Sparkle size={14} weight="fill" className="text-accent" />
          </div>
          <span className="display text-[15px] font-bold">Assistant</span>
        </div>
        {chat.turns.length > 0 && (
          <Button variant="ghost" size="sm" onClick={chat.reset} className="no-drag">
            <Broom size={14} /> New chat
          </Button>
        )}
      </div>
      <div className="min-h-0 flex-1">
        <ChatPanel chat={chat} codexConnected={codex.connected} onOpenSettings={onOpenSettings} />
      </div>
    </div>
  )
}
