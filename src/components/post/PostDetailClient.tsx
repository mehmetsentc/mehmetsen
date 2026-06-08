'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertCircle, ArrowLeft, Loader2, RefreshCw } from 'lucide-react'
import { postService } from '@/services/postService'
import { PostDetail } from '@/components/post/PostDetail'
import { ROUTES } from '@/constants/routes'
import { getCache, setCache, CACHE_TTL } from '@/lib/clientCache'
import type { Post } from '@/types/post'

interface PostDetailClientProps {
  postId: string
}

interface CachedPostDetail {
  post: Post
  suggested: Post[]
}

function postDetailCacheKey(postId: string): string {
  return `post:${postId}`
}

export function PostDetailClient({ postId }: PostDetailClientProps) {
  const [post, setPost] = useState<Post | null>(null)
  const [suggested, setSuggested] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async ({ background = false }: { background?: boolean } = {}) => {
    if (!background) setLoading(true)
    setError(null)
    try {
      const fetched = await postService.getNewsById(postId)
      if (!fetched) {
        // Only surface "not found" if we have nothing cached to show.
        if (!background) {
          setError('Haber bulunamadı')
          setPost(null)
        }
        return
      }
      setPost(fetched)
      postService.incrementViews(postId).catch(() => {})

      const related = await postService.getSuggestedNews(postId, {
        categoryId: fetched.categoryId,
        limit: 10,
      })
      setSuggested(related)
      setCache<CachedPostDetail>(
        postDetailCacheKey(postId),
        { post: fetched, suggested: related },
        CACHE_TTL.LONG
      )
    } catch (err) {
      // Keep cached content visible on background revalidation failure.
      if (!background) {
        setError(err instanceof Error ? err.message : 'Haber yüklenemedi')
      }
    } finally {
      if (!background) setLoading(false)
    }
  }

  useEffect(() => {
    // Stale-while-revalidate: paint cached detail instantly, then refresh.
    const cached = getCache<CachedPostDetail>(postDetailCacheKey(postId))
    if (cached?.post) {
      setPost(cached.post)
      setSuggested(cached.suggested ?? [])
      setLoading(false)
      void load({ background: true })
    } else {
      void load()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId])

  if (loading) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <p className="text-sm text-gray-500 dark:text-gray-400">Haber yükleniyor...</p>
      </div>
    )
  }

  if (error || !post) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-gray-100 bg-white p-8 text-center dark:border-gray-800 dark:bg-gray-900">
        <AlertCircle className="mx-auto mb-3 h-10 w-10 text-red-400" />
        <p className="font-semibold text-gray-900 dark:text-gray-100">
          {error ?? 'Haber bulunamadı'}
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => load()}
            className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <RefreshCw className="h-4 w-4" />
            Tekrar dene
          </button>
          <Link
            href={ROUTES.FEED}
            className="inline-flex items-center gap-2 rounded-full border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Akışa dön
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div>
      <Link
        href={ROUTES.FEED}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
      >
        <ArrowLeft className="h-4 w-4" />
        Akışa dön
      </Link>
      <PostDetail post={post} suggested={suggested} />
    </div>
  )
}
