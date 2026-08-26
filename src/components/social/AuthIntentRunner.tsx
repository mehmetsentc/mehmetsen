'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { consumeAuthIntent } from '@/lib/social/authIntent'
import { isSocialGraphEnabledClient } from '@/lib/social/featureFlagClient'
import { socialApi } from '@/lib/social/clientApi'

/** Executes a pending auth intent after login (follow/like/save). */
export function AuthIntentRunner() {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (loading || !user || !isSocialGraphEnabledClient()) return
    const intent = consumeAuthIntent()
    if (!intent) return

    void (async () => {
      try {
        if (intent.action === 'FOLLOW' && intent.targetType === 'publisher') {
          await socialApi.followPublisher(intent.targetId)
        } else if (intent.action === 'LIKE' && intent.targetType === 'article') {
          await socialApi.likeArticle(intent.targetId)
        } else if (intent.action === 'SAVE' && intent.targetType === 'article') {
          await socialApi.saveArticle(intent.targetId)
        }
      } catch {
        // Non-fatal — user is logged in; they can retry manually.
      } finally {
        router.replace(intent.returnUrl)
      }
    })()
  }, [loading, user, router])

  return null
}
