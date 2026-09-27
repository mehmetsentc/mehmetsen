'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { usePageState } from '@/hooks/usePageState'
import { PAGE_STATE_KEYS } from '@/lib/stateKeys'
import { Grid3X3, Clapperboard, Bookmark, Heart } from 'lucide-react'
import { cn } from '@/lib/utils'
import { resolveProfileTab, type ProfileContentTab } from '@/lib/profile/profileTabs'
import { postService } from '@/services/postService'
import { saveService } from '@/services/saveService'
import { likeService } from '@/services/likeService'
import { ProfileMasonryFeed } from './ProfileMasonryFeed'
import type { Post } from '@/types/post'

type Tab = ProfileContentTab

interface ProfileTabsProps {
  userId: string
  username: string
  isOwnProfile: boolean
  initialTab?: Tab
  initialPosts?: Post[]
}

export function ProfileTabs({
  userId,
  username,
  isOwnProfile,
  initialTab = 'posts',
  initialPosts = [],
}: ProfileTabsProps) {
  const [activeTab, setActiveTab] = usePageState<Tab>(PAGE_STATE_KEYS.profileTab, initialTab)
  const seedOk = activeTab === 'posts' && initialPosts.length > 0
  const [posts, setPosts] = useState<Post[]>(() => (seedOk ? initialPosts : []))
  const [loading, setLoading] = useState(!seedOk)
  const seededPostsRef = useRef(seedOk)

  const tab = resolveProfileTab(activeTab, isOwnProfile)
  const [loadError, setLoadError] = useState(false)

  const tabs: { id: Tab; label: string; icon: typeof Grid3X3 }[] = [
    { id: 'posts', label: 'Haberler', icon: Grid3X3 },
    { id: 'reels', label: 'Videolar', icon: Clapperboard },
    ...(isOwnProfile
      ? [
          { id: 'saved' as const, label: 'Kayıtlar', icon: Bookmark },
          { id: 'liked' as const, label: 'Beğeni', icon: Heart },
        ]
      : []),
  ]

  const loadTab = useCallback(async () => {
    if ((tab === 'saved' || tab === 'liked') && !isOwnProfile) {
      setPosts([])
      setLoadError(false)
      setLoading(false)
      return
    }

    // SSR seeded posts: skip first posts-tab fetch to avoid LCP waterfall.
    if (tab === 'posts' && seededPostsRef.current) {
      seededPostsRef.current = false
      setLoadError(false)
      setLoading(false)
      return
    }

    setLoading(true)
    setLoadError(false)
    try {
      if (tab === 'posts') {
        const result = await postService.getNewsByAuthor(username)
        setPosts(result.posts)
      } else if (tab === 'reels') {
        const result = await postService.getNewsByAuthor(username, { videosOnly: true })
        setPosts(result.posts)
      } else if (tab === 'saved') {
        const ids = await saveService.getSavedPostIds(userId)
        setPosts(await postService.getNewsByIds(ids))
      } else if (tab === 'liked') {
        const ids = await likeService.getLikedPostIds(userId)
        setPosts(await postService.getNewsByIds(ids))
      }
    } catch (error) {
      console.error('[ProfileTabs] load failed:', error)
      setLoadError(true)
      setPosts([])
    } finally {
      setLoading(false)
    }
  }, [tab, username, userId, isOwnProfile])

  useEffect(() => {
    loadTab()
  }, [loadTab])

  const emptyMessages: Record<Tab, string> = {
    posts: 'Henüz herkese açık haber yok.',
    reels: 'Henüz video paylaşılmamış.',
    saved: 'Kaydedilen haber yok.',
    liked: 'Beğenilen haber yok.',
  }

  return (
    <div>
      <div className="profile-tabs-bar">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            aria-current={tab === id ? 'page' : undefined}
            aria-label={label}
            className={cn('profile-tab', tab === id && 'profile-tab-active')}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">{label}</span>
          </button>
        ))}
      </div>

      {loadError ? (
        <p className="py-16 text-center text-sm text-[rgb(var(--color-muted))]" role="alert">
          Haberler yüklenemedi.
        </p>
      ) : (
        <ProfileMasonryFeed posts={posts} loading={loading} emptyMessage={emptyMessages[tab]} />
      )}
    </div>
  )
}
