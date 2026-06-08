'use client'

import { useState, useEffect, useCallback } from 'react'
import { Grid3X3, Clapperboard, Bookmark, Heart, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { postService } from '@/services/postService'
import { saveService } from '@/services/saveService'
import { likeService } from '@/services/likeService'
import { ProfileGrid } from './ProfileGrid'
import type { Post } from '@/types/post'

type Tab = 'posts' | 'reels' | 'saved' | 'liked'

interface ProfileTabsProps {
  userId: string
  username: string
  isOwnProfile: boolean
  initialTab?: Tab
}

export function ProfileTabs({
  userId,
  username,
  isOwnProfile,
  initialTab = 'posts',
}: ProfileTabsProps) {
  const [activeTab, setActiveTab] = useState<Tab>(initialTab)
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)

  const tabs: { id: Tab; label: string; icon: typeof Grid3X3; private?: boolean }[] = [
    { id: 'posts', label: 'Gönderiler', icon: Grid3X3 },
    { id: 'reels', label: 'Videolar', icon: Clapperboard },
    { id: 'saved', label: 'Kaydedilenler', icon: Bookmark, private: true },
    { id: 'liked', label: 'Beğenilenler', icon: Heart, private: true },
  ]

  const loadTab = useCallback(async () => {
    if ((activeTab === 'saved' || activeTab === 'liked') && !isOwnProfile) {
      setPosts([])
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      if (activeTab === 'posts') {
        const result = await postService.getNewsByAuthor(username)
        setPosts(result.posts)
      } else if (activeTab === 'reels') {
        const result = await postService.getNewsByAuthor(username, { videosOnly: true })
        setPosts(result.posts)
      } else if (activeTab === 'saved') {
        const ids = await saveService.getSavedPostIds(userId)
        setPosts(await postService.getNewsByIds(ids))
      } else if (activeTab === 'liked') {
        const ids = await likeService.getLikedPostIds(userId)
        setPosts(await postService.getNewsByIds(ids))
      }
    } catch (error) {
      console.error('[ProfileTabs] load failed:', error)
      setPosts([])
    } finally {
      setLoading(false)
    }
  }, [activeTab, username, userId, isOwnProfile])

  useEffect(() => {
    loadTab()
  }, [loadTab])

  const emptyMessages: Record<Tab, string> = {
    posts: 'Henüz haber paylaşılmamış',
    reels: 'Henüz video paylaşılmamış',
    saved: 'Kaydedilen içerik yok',
    liked: 'Beğenilen içerik yok',
  }

  return (
    <div>
      <div className="profile-tabs-bar">
        {tabs.map(({ id, label, icon: Icon, private: isPrivate }) => {
          const locked = isPrivate && !isOwnProfile
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              aria-label={label}
              title={label}
              className={cn(
                'profile-tab',
                activeTab === id && 'profile-tab-active',
                locked && 'opacity-60'
              )}
            >
              <Icon className="h-4 w-4" />
            </button>
          )
        })}
      </div>

      {(activeTab === 'saved' || activeTab === 'liked') && !isOwnProfile ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <Lock className="profile-empty-icon h-8 w-8" />
          <p className="text-sm text-[rgb(var(--color-muted))]">Bu sekme yalnızca profil sahibine görünür</p>
        </div>
      ) : (
        <ProfileGrid posts={posts} loading={loading} emptyMessage={emptyMessages[activeTab]} />
      )}
    </div>
  )
}
