'use client'

import { useCallback, useEffect, useState } from 'react'
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
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const load = useCallback(async () => {
    if (!user?.uid) {
      setPosts([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(false)
    try {
      const saved = await saveService.getSavedPosts(user.uid)
      setPosts(saved)
    } catch (err) {
      console.error('[SavedPage] load failed:', err)
      setError(true)
      setPosts([])
    } finally {
      setLoading(false)
    }
  }, [user?.uid])

  useEffect(() => {
    if (authLoading) return
    load()
  }, [authLoading, load])

  const isLoading = authLoading || loading

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
      ) : error ? (
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
      ) : posts.length === 0 ? (
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
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </div>
  )
}
