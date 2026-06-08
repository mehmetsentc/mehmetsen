'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { notificationService } from '@/services/notificationService'
import { useAuth } from '@/hooks/useAuth'
import type { Notification } from '@/types/notification'

export function useNotifications() {
  const { user } = useAuth()
  const uid = user?.uid
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!uid) {
      setNotifications([])
      setLoading(false)
      setError(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(false)

    // Initial one-shot fetch resolves the loading/error states deterministically,
    // then a live subscription keeps the list up to date.
    notificationService
      .getNotifications(uid)
      .then((items) => {
        if (!cancelled) {
          setNotifications(items)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true)
          setLoading(false)
        }
      })

    const unsubscribe = notificationService.subscribeNotifications(uid, (items) => {
      if (!cancelled) {
        setNotifications(items)
        setLoading(false)
      }
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [uid])

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  )

  const markAllAsRead = useCallback(async () => {
    if (!uid) return
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    await notificationService.markAllAsRead(uid)
  }, [uid])

  const markAsRead = useCallback(async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    )
    await notificationService.markAsRead(id)
  }, [])

  return { notifications, loading, error, unreadCount, markAllAsRead, markAsRead }
}
