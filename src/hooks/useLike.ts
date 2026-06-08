'use client'

import { useState, useCallback, useEffect } from 'react'
import toast from 'react-hot-toast'
import { likeService } from '@/services/likeService'
import { useAuth } from '@/hooks/useAuth'

interface UseLikeOptions {
  postId: string
  initialLiked?: boolean
  initialCount?: number
}

function clampCount(value: number): number {
  return Math.max(0, value)
}

export function useLike({ postId, initialLiked = false, initialCount = 0 }: UseLikeOptions) {
  const { user } = useAuth()
  const [liked, setLiked] = useState(initialLiked)
  const [count, setCount] = useState(() => clampCount(initialCount))
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!user?.uid || !postId) return
    let cancelled = false
    likeService.isLiked(user.uid, postId).then((isLiked) => {
      if (!cancelled) setLiked(isLiked)
    })
    return () => {
      cancelled = true
    }
  }, [user?.uid, postId])

  const toggle = useCallback(async () => {
    if (!user) {
      toast.error('Beğenmek için giriş yapın')
      return
    }
    if (loading) return

    const prevLiked = liked
    const prevCount = count
    const optimisticLiked = !prevLiked
    setLiked(optimisticLiked)
    setCount(clampCount(prevLiked ? prevCount - 1 : prevCount + 1))
    setLoading(true)

    try {
      const newLiked = await likeService.toggle(user.uid, postId)
      setLiked(newLiked)
      if (newLiked !== optimisticLiked) {
        setCount(clampCount(newLiked ? prevCount + 1 : prevCount - 1))
      }
    } catch (err) {
      console.error('[useLike]', err)
      setLiked(prevLiked)
      setCount(clampCount(prevCount))
      const code = (err as { code?: string })?.code
      if (code === 'permission-denied') {
        toast.error('Beğeni için yetkiniz yok. Giriş yapıp tekrar deneyin.')
      } else {
        toast.error('Beğeni işlemi başarısız oldu')
      }
    } finally {
      setLoading(false)
    }
  }, [user, postId, liked, count, loading])

  return { liked, count: clampCount(count), toggle, loading, setLiked, setCount }
}
