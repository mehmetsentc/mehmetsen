'use client'

import { useEffect, useState } from 'react'
import { PostCard } from './PostCard'
import { FeedFilters } from './FeedFilters'
import { useRecentCities } from '@/hooks/useRecentCities'
import { usePosts } from '@/hooks/usePosts'

export function FeedList() {
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const { cities, loading: citiesLoading } = useRecentCities()
  const { posts, loading, hasMore, fetchPosts, reset } = usePosts(categoryId ?? undefined)

  useEffect(() => {
    reset()
    fetchPosts(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId])

  const handleCategoryChange = (id: string | null) => {
    setCategoryId(id)
  }

  return (
    <div className="space-y-4">
      <FeedFilters
        selected={categoryId}
        onChange={handleCategoryChange}
        cities={cities}
        citiesLoading={citiesLoading}
      />

      {posts.length === 0 && !loading && (
        <div className="surface-card border-dashed py-16 text-center">
          <p className="text-[rgb(var(--color-muted))]">Henüz haber yok.</p>
          <p className="mt-1 text-sm text-[rgb(var(--color-muted))]">İlk haberi sen paylaş!</p>
        </div>
      )}

      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}

      {loading && (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="skeleton h-40 rounded-2xl" />
          ))}
        </div>
      )}

      {!loading && hasMore && posts.length > 0 && (
        <button
          onClick={() => fetchPosts()}
          className="w-full rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] py-3 text-sm font-medium text-[rgb(var(--color-muted))] transition-colors hover:bg-[rgb(var(--color-surface))]"
        >
          Daha fazla yükle
        </button>
      )}
    </div>
  )
}
