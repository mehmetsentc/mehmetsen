'use client'

import { useCallback } from 'react'
import { useCachedPageData } from '@/hooks/useCachedPageData'
import { PAGE_CACHE_KEYS } from '@/lib/pageCache'
import { Bookmark } from 'lucide-react'
import Link from 'next/link'
import { PageHeader } from '@/components/layout/PageHeader'
import { PostCard } from '@/components/feed/PostCard'
import { ROUTES } from '@/constants/routes'
import { useAuth } from '@/hooks/useAuth'
import { saveService } from '@/services/saveService'
import type { Post } from '@/types/post'

export default function SavedPage() {
  const { user, loading: authLoading } = useAuth()
  const cacheKey = user?.uid ? PAGE_CACHE_KEYS.saved(user.uid) : 'page:saved:guest'

  const {
    data: posts,
    loading,
    error,
    refresh,
  } = useCachedPageData<Post[]>(
    cacheKey,
    async () => {
      if (!user?.uid) return []
      return saveService.getSavedPosts(user.uid)
    },
    { enabled: Boolean(user?.uid) && !authLoading }
  )

  const load = useCallback(async () => {
    try {
      await refresh()
    } catch (err) {
      console.error('[SavedPage] load failed:', err)
    }
  }, [refresh])

  const isLoading = authLoading || loading
  const savedPosts = posts ?? []

  return (
    <div className="space-y-4">
      <PageHeader
        title="Kaydedilenler"
        subtitle="Daha sonra okumak için kaydettiğin haberler"
        backHref={ROUTES.FEED}
        backLabel="Ana Sayfa"
      />

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="skeleton h-40 rounded-2xl" />
          ))}
        </div>
      ) : error && savedPosts.length === 0 ? (
        <div className="surface-card empty-state">
          <div className="empty-state-icon">
            <Bookmark className="h-7 w-7 text-blue-600 dark:text-blue-400" />
          </div>
          <p className="empty-state-title">Kayıtlar yüklenemedi</p>
          <p className="empty-state-text">Bir şeyler ters gitti. Lütfen tekrar deneyin.</p>
          <button
            type="button"
            onClick={load}
            className="mt-4 rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Tekrar dene
          </button>
        </div>
      ) : savedPosts.length === 0 ? (
        <div className="surface-card empty-state">
          <div className="empty-state-icon">
            <Bookmark className="h-7 w-7 text-blue-600 dark:text-blue-400" />
          </div>
          <p className="empty-state-title">Henüz kayıtlı haber yok</p>
          <p className="empty-state-text">
            Haber kartlarındaki kaydet ikonuna tıklayarak buraya ekleyebilirsin.
          </p>
          <Link
            href={ROUTES.FEED}
            className="mt-4 rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Gündeme git
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {savedPosts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </div>
  )
}
