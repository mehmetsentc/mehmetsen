'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus, UserMinus, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'
import { formatCount } from '@/lib/postUtils'
import { useAuth } from '@/hooks/useAuth'
import { isSocialGraphEnabledClient } from '@/lib/social/featureFlagClient'
import { socialApi } from '@/lib/social/clientApi'
import { buildAuthIntent, loginHrefWithIntent } from '@/lib/social/authIntent'
import { ROUTES } from '@/constants/routes'

interface FollowButtonProps {
  publisherId: string
  publisherSlug?: string
  initialFollowing?: boolean
  initialFollowerCount?: number
  className?: string
  showCount?: boolean
}

export function FollowButton({
  publisherId,
  publisherSlug,
  initialFollowing = false,
  initialFollowerCount = 0,
  className,
  showCount = true,
}: FollowButtonProps) {
  const { user } = useAuth()
  const router = useRouter()
  const [following, setFollowing] = useState(initialFollowing)
  const [followerCount, setFollowerCount] = useState(initialFollowerCount)
  const [loading, setLoading] = useState(false)
  const socialEnabled = isSocialGraphEnabledClient()

  useEffect(() => {
    if ((!socialEnabled && !user) || !publisherId) return
    let cancelled = false
    if (user) {
      socialApi
        .getPublisherState([publisherId])
        .then((res) => {
          const state = (res as { states?: Array<{ following: boolean; followerCount: number }> }).states?.[0]
          if (!cancelled && state) {
            setFollowing(state.following)
            setFollowerCount(state.followerCount)
          }
        })
        .catch(() => {})
    }
    return () => {
      cancelled = true
    }
  }, [socialEnabled, user, publisherId])

  const toggle = useCallback(async () => {
    if (!user && !socialEnabled) return
    if (!user) {
      const returnUrl = publisherSlug ? ROUTES.PUBLISHER(publisherSlug) : ROUTES.HOME
      const intent = buildAuthIntent('FOLLOW', 'publisher', publisherId, returnUrl)
      if (intent) router.push(loginHrefWithIntent(intent))
      return
    }
    if (loading) return

    const prevFollowing = following
    const prevCount = followerCount
    setFollowing(!prevFollowing)
    setFollowerCount(prevFollowing ? Math.max(0, prevCount - 1) : prevCount + 1)
    setLoading(true)

    try {
      const res = prevFollowing
        ? await socialApi.unfollowPublisher(publisherId)
        : await socialApi.followPublisher(publisherId)
      const body = res as { following?: boolean; followerCount?: number }
      setFollowing(Boolean(body.following ?? !prevFollowing))
      if (typeof body.followerCount === 'number') setFollowerCount(body.followerCount)
    } catch {
      setFollowing(prevFollowing)
      setFollowerCount(prevCount)
      toast.error('Takip işlemi başarısız oldu')
    } finally {
      setLoading(false)
    }
  }, [socialEnabled, user, loading, following, followerCount, publisherId, publisherSlug, router])

  if (!socialEnabled && !user) return null

  return (
    <div className={cn('inline-flex items-center gap-2', className)}>
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={loading}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-60',
          following
            ? 'border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] text-[rgb(var(--color-text))]'
            : 'bg-brand-600 text-white hover:bg-brand-700'
        )}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : following ? (
          <UserMinus className="h-4 w-4" aria-hidden />
        ) : (
          <UserPlus className="h-4 w-4" aria-hidden />
        )}
        {following ? 'Takipten çık' : 'Takip et'}
      </button>
      {showCount ? (
        <span className="text-xs text-[rgb(var(--color-muted))]">
          {formatCount(followerCount)} takipçi
        </span>
      ) : null}
    </div>
  )
}
