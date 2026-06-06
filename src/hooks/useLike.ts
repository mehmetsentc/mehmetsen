'use client'

import { useState, useCallback } from 'react'
import toast from 'react-hot-toast'
import { likeService } from '@/services/likeService'
import { useAuth } from '@/hooks/useAuth'

interface UseLikeOptions {
  postId: string
  initialLiked?: boolean
  initialCount?: number
}

export function useLike({ postId, initialLiked = false, initialCount = 0 }: UseLikeOptions) {
  const { user } = useAuth()
  const [liked, setLiked] = useState(initialLiked)
  const [count, setCount] = useState(initialCount)
  const [loading, setLoading] = useState(false)

  const toggle = useCallback(async () => {
    if (!user) {
      toast.error('Beğenmek için giriş yapın')
      return
    }
    if (loading) return

    const prevLiked = liked
    const prevCount = count
    setLiked(!prevLiked)
    setCount(prevLiked ? prevCount - 1 : prevCount + 1)
    setLoading(true)

    try {
      const newLiked = await likeService.toggle(user.uid, postId, prevLiked)
      setLiked(newLiked)
      setCount(newLiked ? prevCount + 1 : prevCount - 1)
    } catch {
      setLiked(prevLiked)
      setCount(prevCount)
      toast.error('Beğeni işlemi başarısız oldu')
    } finally {
      setLoading(false)
    }
  }, [user, postId, liked, count, loading])

  return { liked, count, toggle, loading, setLiked, setCount }
}
