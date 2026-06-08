'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { followService } from '@/services/followService'
import { ROUTES } from '@/constants/routes'

export function useFollow(
  currentUserId: string | undefined,
  targetUserId: string,
  initialFollowing: boolean
) {
  const router = useRouter()
  const [following, setFollowing] = useState(initialFollowing)
  const [loading, setLoading] = useState(false)

  const toggle = useCallback(async () => {
    if (!currentUserId) {
      toast.error('Takip etmek için giriş yapın')
      router.push(ROUTES.LOGIN)
      return
    }

    if (currentUserId === targetUserId) return

    setLoading(true)
    try {
      const next = await followService.toggle(currentUserId, targetUserId, following)
      setFollowing(next)
      toast.success(next ? 'Takip edildi' : 'Takipten çıkarıldı')
      return next
    } catch (error) {
      const message = error instanceof Error ? error.message : 'İşlem başarısız oldu'
      toast.error(message)
      return following
    } finally {
      setLoading(false)
    }
  }, [currentUserId, targetUserId, following, router])

  return { following, loading, toggle, setFollowing }
}
