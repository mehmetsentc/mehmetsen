'use client'

import { cn } from '@/lib/utils'
import { formatMessageBubbleTime } from '@/lib/messageUtils'
import type { Message } from '@/types/message'

interface MessageBubbleProps {
  message: Message
  isOwn: boolean
}

export function MessageBubble({ message, isOwn }: MessageBubbleProps) {
  return (
    <div className={cn('flex', isOwn ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'message-bubble max-w-[75%] px-3.5 py-2.5',
          isOwn ? 'message-bubble-own' : 'message-bubble-other'
        )}
      >
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.text}</p>
        <p
          className={cn(
            'mt-1 text-[10px]',
            isOwn ? 'text-white/70' : 'text-[rgb(var(--color-muted))]'
          )}
        >
          {formatMessageBubbleTime(message.createdAt)}
        </p>
      </div>
    </div>
  )
}
