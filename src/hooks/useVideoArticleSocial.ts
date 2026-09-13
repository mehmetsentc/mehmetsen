'use client'

import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { socialApi } from '@/lib/social/clientApi'
import { useAuth } from '@/hooks/useAuth'

function clampCount(value: number): number {
  return Math.max(0, value)
}

interface UseVideoArticleSocialOptions {
  articleId: string
  initialLiked?: boolean
  initialLikeCount?: number
  initialSaved?: boolean
  initialSaveCount?: number
  enabled?: boolean
}

export function useVideoArticleSocial({
  articleId,
  initialLiked = false,
  initialLikeCount = 0,
  initialSaved = false,
  initialSaveCount = 0,
  enabled = true,
}: UseVideoArticleSocialOptions) {
  const { user } = useAuth()
  const [liked, setLiked] = useState(initialLiked)
  const [likeCount, setLikeCount] = useState(() => clampCount(initialLikeCount))
  const [saved, setSaved] = useState(initialSaved)
  const [saveCount, setSaveCount] = useState(() => clampCount(initialSaveCount))
  const [likeLoading, setLikeLoading] = useState(false)
  const [saveLoading, setSaveLoading] = useState(false)

  useEffect(() => {
    setLiked(initialLiked)
    setLikeCount(clampCount(initialLikeCount))
    setSaved(initialSaved)
    setSaveCount(clampCount(initialSaveCount))
  }, [articleId, initialLiked, initialLikeCount, initialSaved, initialSaveCount])

  const requireUser = useCallback(
    (action: string) => {
      if (user) return true
      toast.error(`${action} için giriş yapın`)
      return false
    },
    [user]
  )

  const toggleLike = useCallback(async () => {
    if (!enabled) return
    if (!requireUser('Beğenmek')) return
    if (likeLoading) return

    const prevLiked = liked
    const prevCount = likeCount
    const nextLiked = !prevLiked
    setLiked(nextLiked)
    setLikeCount(clampCount(prevLiked ? prevCount - 1 : prevCount + 1))
    setLikeLoading(true)
    try {
      const res = nextLiked
        ? await socialApi.likeArticle(articleId)
        : await socialApi.unlikeArticle(articleId)
      const body = res as { liked?: boolean; likeCount?: number }
      if (typeof body.liked === 'boolean') setLiked(body.liked)
      if (typeof body.likeCount === 'number') setLikeCount(clampCount(body.likeCount))
    } catch (err) {
      setLiked(prevLiked)
      setLikeCount(clampCount(prevCount))
      const message = err instanceof Error ? err.message : ''
      if (message === 'AUTH_REQUIRED' || message === 'Unauthorized') {
        toast.error('Beğenmek için giriş yapın')
      } else {
        toast.error('Beğeni işlemi başarısız oldu')
      }
    } finally {
      setLikeLoading(false)
    }
  }, [enabled, requireUser, likeLoading, liked, likeCount, articleId])

  const toggleSave = useCallback(async () => {
    if (!enabled) return
    if (!requireUser('Kaydetmek')) return
    if (saveLoading) return

    const prevSaved = saved
    const prevCount = saveCount
    const nextSaved = !prevSaved
    setSaved(nextSaved)
    setSaveCount(clampCount(prevSaved ? prevCount - 1 : prevCount + 1))
    setSaveLoading(true)
    try {
      if (nextSaved) await socialApi.saveArticle(articleId)
      else await socialApi.unsaveArticle(articleId)
      toast.success(nextSaved ? 'Kaydedildi' : 'Kayıttan kaldırıldı')
    } catch (err) {
      setSaved(prevSaved)
      setSaveCount(clampCount(prevCount))
      const message = err instanceof Error ? err.message : ''
      if (message === 'AUTH_REQUIRED' || message === 'Unauthorized') {
        toast.error('Kaydetmek için giriş yapın')
      } else {
        toast.error('Kaydetme işlemi başarısız oldu')
      }
    } finally {
      setSaveLoading(false)
    }
  }, [enabled, requireUser, saveLoading, saved, saveCount, articleId])

  const recordShare = useCallback(async () => {
    if (!enabled) return
    try {
      await socialApi.recordShare(articleId)
    } catch {
      /* share telemetry is best-effort */
    }
  }, [enabled, articleId])

  return {
    liked,
    likeCount: clampCount(likeCount),
    saved,
    saveCount: clampCount(saveCount),
    likeLoading,
    saveLoading,
    toggleLike,
    toggleSave,
    recordShare,
  }
}
