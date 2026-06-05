'use client'

import { useEffect, useState } from 'react'
import { PostCard } from './PostCard'
import { FeedFilters } from './FeedFilters'
import { usePosts } from '@/hooks/usePosts'

export function FeedList() {
  const [categoryId, setCategoryId] = useState<string | null>(null)
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
      <FeedFilters selected={categoryId} onChange={handleCategoryChange} />

      {posts.length === 0 && !loading && (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white py-16 text-center">
          <p className="text-gray-400">Henüz haber yok.</p>
          <p className="mt-1 text-sm text-gray-300">İlk haberi sen paylaş!</p>
        </div>
      )}

      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}

      {loading && (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl bg-gray-100" />
          ))}
        </div>
      )}

      {!loading && hasMore && posts.length > 0 && (
        <button
          onClick={() => fetchPosts()}
          className="w-full rounded-xl border border-gray-200 bg-white py-3 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-50"
        >
          Daha fazla yükle
        </button>
      )}
    </div>
  )
}
