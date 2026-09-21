'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { usePageState } from '@/hooks/usePageState'
import { PAGE_STATE_KEYS } from '@/lib/stateKeys'
import { Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { postService } from '@/services/postService'
import { saveService } from '@/services/saveService'
import { likeService } from '@/services/likeService'
import { ProfileContentGrid } from './ProfileContentGrid'
import { ProfileAboutPanel } from './ProfileAboutPanel'
import type { Post } from '@/types/post'
import type { User } from '@/types/user'

type Tab = 'posts' | 'liked' | 'saved' | 'about' | 'reels'

interface ProfileTabsProps {
  userId: string
  username: string
  isOwnProfile: boolean
  user: User
  initialTab?: Tab
  initialPosts?: Post[]
}

export function ProfileTabs({
  userId,
  username,
  isOwnProfile,
  user,
  initialTab = 'posts',
  initialPosts = [],
}: ProfileTabsProps) {
  const [activeTab, setActiveTab] = usePageState<Tab>(PAGE_STATE_KEYS.profileTab, initialTab)
  const resolvedTab = activeTab === 'reels' ? 'posts' : activeTab
  const seedOk = resolvedTab === 'posts' && initialPosts.length > 0
  const [posts, setPosts] = useState<Post[]>(() => (seedOk ? initialPosts : []))
  const [loading, setLoading] = useState(!seedOk)
  const seededPostsRef = useRef(seedOk)

  const tabs: { id: Exclude<Tab, 'reels'>; label: string; private?: boolean }[] = [
    { id: 'posts', label: 'Paylaşılan' },
    { id: 'liked', label: 'Beğenilen', private: true },
    { id: 'saved', label: 'Kaydedilen', private: true },
    { id: 'about', label: 'Hakkında' },
  ]

  const loadTab = useCallback(async () => {
    if (resolvedTab === 'about') {
      setPosts([])
      setLoading(false)
      return
    }
    if ((resolvedTab === 'saved' || resolvedTab === 'liked') && !isOwnProfile) {
      setPosts([])
      setLoading(false)
      return
    }

    if (resolvedTab === 'posts' && seededPostsRef.current) {
      seededPostsRef.current = false
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      if (resolvedTab === 'posts') {
        const result = await postService.getNewsByAuthor(username)
        setPosts(result.posts)
      } else if (resolvedTab === 'saved') {
        const ids = await saveService.getSavedPostIds(userId)
        setPosts(await postService.getNewsByIds(ids))
      } else if (resolvedTab === 'liked') {
        const ids = await likeService.getLikedPostIds(userId)
        setPosts(await postService.getNewsByIds(ids))
      }
    } catch (error) {
      console.error('[ProfileTabs] load failed:', error)
      setPosts([])
    } finally {
      setLoading(false)
    }
  }, [resolvedTab, username, userId, isOwnProfile])

  useEffect(() => {
    loadTab()
  }, [loadTab])

  const emptyMessages: Record<Exclude<Tab, 'reels' | 'about'>, string> = {
    posts: 'Henüz haber paylaşılmamış',
    saved: 'Kaydedilen içerik yok',
    liked: 'Beğenilen içerik yok',
  }

  return (
    <div className="px-3 pb-8">
      <div className="nah-pill-tabs" role="tablist" aria-label="Profil içerikleri">
        {tabs.map(({ id, label, private: isPrivate }) => {
          const locked = Boolean(isPrivate && !isOwnProfile)
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              aria-label={label}
              className={cn(resolvedTab === id && 'is-active', locked && 'opacity-60')}
            >
              {label}
            </button>
          )
        })}
      </div>

      {resolvedTab === 'about' ? (
        <ProfileAboutPanel user={user} />
      ) : (resolvedTab === 'saved' || resolvedTab === 'liked') && !isOwnProfile ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <Lock className="h-8 w-8 text-white/25" />
          <p className="text-sm text-[rgb(var(--nah-text-muted))]">Bu sekme yalnızca profil sahibine görünür</p>
        </div>
      ) : (
        <div className="mt-3">
          <ProfileContentGrid
            posts={posts}
            loading={loading}
            emptyMessage={emptyMessages[resolvedTab]}
          />
        </div>
      )}
    </div>
  )
}
