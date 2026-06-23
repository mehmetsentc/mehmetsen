'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { notificationService } from '@/services/notificationService'
import { useAuth } from '@/hooks/useAuth'
import type { Notification } from '@/types/notification'

/**
 * Notification refresh cadence.
 *
 * We deliberately do not use Firestore `onSnapshot` here — a live listener
 * billed Firestore continuously per signed-in user and was a top source of
 * runaway daily reads. Notifications aren't latency-critical; a periodic
 * poll plus a manual refresh when the tab regains focus is fine.
 *
 * 90s is the sweet spot: fast enough that users see new badges shortly
 * after the action that triggered them, slow enough that an idle tab in
 * the background costs ~40 reads/hour instead of streaming forever.
 */
const NOTIFICATIONS_POLL_MS = 90_000

export function useNotifications() {
  const { user } = useAuth()
  const uid = user?.uid
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const cancelledRef = useRef(false)

  const loadOnce = useCallback(
    async (showLoading: boolean) => {
      if (!uid) return
      if (showLoading) setLoading(true)
      try {
        const items = await notificationService.getNotifications(uid)
        if (!cancelledRef.current) {
          setNotifications(items)
          setError(false)
        }
      } catch {
        if (!cancelledRef.current) setError(true)
      } finally {
        if (!cancelledRef.current && showLoading) setLoading(false)
      }
    },
    [uid]
  )

  useEffect(() => {
    cancelledRef.current = false

    if (!uid) {
      setNotifications([])
      setLoading(false)
      setError(false)
      return
    }

    void loadOnce(true)

    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return
      void loadOnce(false)
    }, NOTIFICATIONS_POLL_MS)

    const onVisibility = () => {
      if (typeof document === 'undefined') return
      if (!document.hidden) void loadOnce(false)
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelledRef.current = true
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [uid, loadOnce])

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
