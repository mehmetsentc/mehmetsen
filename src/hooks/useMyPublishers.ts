'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { auth } from '@/lib/firebase/auth'
import type { PublisherMemberRole, PublisherRecord } from '@/types/publisher'

export type MyPublisher = {
  id: string
  slug: string
  displayName: string
  role: PublisherMemberRole
  status: PublisherRecord['status']
  logoUrl: string | null
}

/**
 * Active publisher memberships for the signed-in user.
 * Used to gate Profil nav and redirect to publisher profile.
 */
export function useMyPublishers() {
  const { user, loading: authLoading } = useAuth()
  const [publishers, setPublishers] = useState<MyPublisher[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (authLoading) return
    if (!user?.uid) {
      setPublishers([])
      setLoading(false)
      setError(null)
      return
    }

    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const token = await auth.currentUser?.getIdToken()
        if (!token) {
          if (!cancelled) {
            setPublishers([])
            setError('Giriş gerekli')
          }
          return
        }
        const res = await fetch('/api/me/publishers', {
          headers: { Authorization: `Bearer ${token}` },
        })
        const body = (await res.json().catch(() => ({}))) as {
          publishers?: MyPublisher[]
          error?: string
        }
        if (!res.ok) {
          throw new Error(body.error || 'Yayıncı listesi alınamadı')
        }
        if (!cancelled) setPublishers(Array.isArray(body.publishers) ? body.publishers : [])
      } catch (err) {
        if (!cancelled) {
          setPublishers([])
          setError(err instanceof Error ? err.message : 'Hata')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [authLoading, user?.uid])

  return {
    publishers,
    loading: authLoading || loading,
    error,
    isPublisher: publishers.length > 0,
  }
}
