'use client'

import { useEffect, useState } from 'react'
import { messageService } from '@/services/messageService'
import type { Message } from '@/types/message'

export function useMessages(conversationId: string | undefined, userId: string | undefined) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!conversationId) {
      setMessages([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const unsubscribe = messageService.subscribeMessages(
      conversationId,
      (items) => {
        setMessages(items)
        setLoading(false)
      },
      (err) => {
        setError(err.message)
        setLoading(false)
      }
    )

    return unsubscribe
  }, [conversationId])

  useEffect(() => {
    if (!conversationId || !userId) return
    void messageService.markAsRead(conversationId, userId)
  }, [conversationId, userId, messages.length])

  return { messages, loading, error }
}
