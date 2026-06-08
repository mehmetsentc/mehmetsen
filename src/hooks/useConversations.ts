'use client'

import { useEffect, useState } from 'react'
import { messageService } from '@/services/messageService'
import type { ConversationPreview } from '@/types/message'

export function useConversations(userId: string | undefined) {
  const [conversations, setConversations] = useState<ConversationPreview[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) {
      setConversations([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const unsubscribe = messageService.subscribeConversations(
      userId,
      (items) => {
        setConversations(items)
        setLoading(false)
      },
      (err) => {
        setError(err.message)
        setLoading(false)
      }
    )

    return unsubscribe
  }, [userId])

  const unreadTotal = conversations.reduce(
    (sum, c) => sum + (c.unreadCount[userId ?? ''] ?? 0),
    0
  )

  return { conversations, loading, error, unreadTotal }
}
