'use client'

import Link from 'next/link'
import { Avatar } from '@/components/ui/Avatar'
import { ROUTES } from '@/constants/routes'
import { formatMessageListTime, truncateMessagePreview } from '@/lib/messageUtils'
import { cn } from '@/lib/utils'
import type { ConversationPreview } from '@/types/message'

interface ConversationListItemProps {
  conversation: ConversationPreview
  currentUserId: string
  active?: boolean
}

export function ConversationListItem({
  conversation,
  currentUserId,
  active = false,
}: ConversationListItemProps) {
  const { otherParticipant } = conversation
  const unread = conversation.unreadCount[currentUserId] ?? 0
  const isOwnLastMessage = conversation.lastMessageSenderId === currentUserId
  const preview = conversation.lastMessageText
    ? `${isOwnLastMessage ? 'Sen: ' : ''}${truncateMessagePreview(conversation.lastMessageText)}`
    : truncateMessagePreview(null)

  return (
    <Link
      href={ROUTES.MESSAGES_CONVERSATION(conversation.id)}
      className={cn(
        'flex items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-[rgb(var(--color-nav-hover))]',
        active && 'bg-[rgb(var(--color-nav-hover))]'
      )}
    >
      <Avatar
        name={otherParticipant.displayName}
        src={otherParticipant.photoURL}
        size="md"
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className={cn('truncate text-sm', unread > 0 ? 'font-bold' : 'font-semibold')}>
            {otherParticipant.username}
          </p>
          {conversation.lastMessageAt && (
            <span className="shrink-0 text-[11px] text-[rgb(var(--color-muted))]">
              {formatMessageListTime(conversation.lastMessageAt)}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p
            className={cn(
              'truncate text-xs',
              unread > 0
                ? 'font-semibold text-[rgb(var(--color-text))]'
                : 'text-[rgb(var(--color-muted))]'
            )}
          >
            {preview}
          </p>
          {unread > 0 && (
            <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 px-1.5 text-[10px] font-bold text-white">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}
