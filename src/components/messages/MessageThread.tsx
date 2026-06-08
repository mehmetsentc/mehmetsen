'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, Loader2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useMessages } from '@/hooks/useMessages'
import { messageService } from '@/services/messageService'
import { Avatar } from '@/components/ui/Avatar'
import { MessageBubble } from './MessageBubble'
import { MessageComposer } from './MessageComposer'
import { ROUTES } from '@/constants/routes'
import type { ConversationPreview } from '@/types/message'

interface MessageThreadProps {
  conversationId: string
}

export function MessageThread({ conversationId }: MessageThreadProps) {
  const { user } = useAuth()
  const { messages, loading, error } = useMessages(conversationId, user?.uid)
  const bottomRef = useRef<HTMLDivElement>(null)
  const [conversation, setConversation] = useState<ConversationPreview | null>(null)

  useEffect(() => {
    if (!user) return
    void messageService.getConversation(conversationId).then((c) => {
      if (!c) return
      const preview = messageService.toPreview(c, user.uid)
      setConversation(preview)
    })
  }, [conversationId, user])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  if (!user) return null

  const other = conversation?.otherParticipant

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-[rgb(var(--color-border))] px-3 py-3">
        <Link
          href={ROUTES.MESSAGES}
          className="flex h-9 w-9 items-center justify-center rounded-full text-[rgb(var(--color-text))] transition-colors hover:bg-[rgb(var(--color-nav-hover))] lg:hidden"
          aria-label="Mesajlara dön"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>

        {other ? (
          <Link
            href={ROUTES.PROFILE(other.username)}
            className="flex min-w-0 flex-1 items-center gap-3"
          >
            <Avatar name={other.displayName} src={other.photoURL} size="sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[rgb(var(--color-text))]">
                {other.username}
              </p>
              <p className="truncate text-xs text-[rgb(var(--color-muted))]">
                {other.displayName}
              </p>
            </div>
          </Link>
        ) : (
          <div className="skeleton h-9 w-32 rounded-lg" />
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-[rgb(var(--color-muted))]" />
          </div>
        ) : error ? (
          <p className="text-center text-sm text-red-500">{error}</p>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <p className="text-sm font-semibold text-[rgb(var(--color-text))]">
              Sohbete başla
            </p>
            <p className="mt-1 text-xs text-[rgb(var(--color-muted))]">
              İlk mesajını göndererek konuşmayı başlat.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                isOwn={message.senderId === user.uid}
              />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <MessageComposer conversationId={conversationId} sender={user} />
    </div>
  )
}
