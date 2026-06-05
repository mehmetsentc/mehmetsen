import { useState, useCallback } from 'react'
import { postService } from '@/services/postService'
import type { Post } from '@/types/post'
import type { QueryDocumentSnapshot } from 'firebase/firestore'

export function usePosts(categoryId?: string) {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null)

  const fetchPosts = useCallback(
    async (reset = false) => {
      if (loading) return
      setLoading(true)
      try {
        const cursor = reset ? undefined : (lastDoc ?? undefined)
        const result = categoryId
          ? await postService.getByCategory(categoryId, cursor)
          : await postService.getFeed(cursor)

        setPosts((prev) => (reset ? result.posts : [...prev, ...result.posts]))
        setLastDoc(result.lastDoc)
        setHasMore(result.hasMore)
      } finally {
        setLoading(false)
      }
    },
    [loading, lastDoc, categoryId]
  )

  const reset = useCallback(() => {
    setPosts([])
    setLastDoc(null)
    setHasMore(true)
  }, [])

  return { posts, loading, hasMore, fetchPosts, reset }
}
