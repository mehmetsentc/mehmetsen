'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertCircle, ArrowLeft, Loader2, RefreshCw } from 'lucide-react'
import { postService } from '@/services/postService'
import { NewsArticleLayout } from '@/components/news/NewsArticleLayout'
import { ROUTES } from '@/constants/routes'
import { getCache, setCache, CACHE_TTL } from '@/lib/clientCache'
import type { Post } from '@/types/post'

interface NewsArticleClientProps {
  postId: string
  initialPost?: Post | null
}

interface CachedNewsDetail {
  post: Post
  suggested: Post[]
}

function newsDetailCacheKey(postId: string): string {
  return `news:${postId}`
}

export function NewsArticleClient({ postId, initialPost }: NewsArticleClientProps) {
  const [post, setPost] = useState<Post | null>(initialPost ?? null)
  const [suggested, setSuggested] = useState<Post[]>([])
  // If we already have initialPost from the server, skip the loading spinner
  const [loading, setLoading] = useState(!initialPost)
  const [error, setError] = useState<string | null>(null)

  const loadSuggested = async (categoryId: string) => {
    try {
      const related = await postService.getSuggestedNews(postId, { categoryId, limit: 10 })
      setSuggested(related)
      return related
    } catch {
      return []
    }
  }

  const load = async ({ background = false }: { background?: boolean } = {}) => {
    if (!background) setLoading(true)
    setError(null)
    try {
      const fetched = await postService.getNewsById(postId)
      if (!fetched) {
        if (!background) {
          setError('Haber bulunamadı')
          setPost(null)
        }
        return
      }
      setPost(fetched)
      postService.incrementViews(postId).catch(() => {})

      const related = await loadSuggested(fetched.categoryId ?? 'gundem')
      setCache<CachedNewsDetail>(
        newsDetailCacheKey(postId),
        { post: fetched, suggested: related },
        CACHE_TTL.LONG
      )
    } catch (err) {
      if (!background) {
        setError(err instanceof Error ? err.message : 'Haber yüklenemedi')
      }
    } finally {
      if (!background) setLoading(false)
    }
  }

  useEffect(() => {
    const cached = getCache<CachedNewsDetail>(newsDetailCacheKey(postId))

    if (cached?.post) {
      // Use cached data instantly
      setPost(cached.post)
      setSuggested(cached.suggested ?? [])
      setLoading(false)
      // Refresh post in background (don't refetch if initialPost was passed — server is source of truth)
      if (!initialPost) void load({ background: true })
      return
    }

    if (initialPost) {
      // Server already provided the post — just load suggested news in background
      setLoading(false)
      postService.incrementViews(postId).catch(() => {})
      void loadSuggested(initialPost.categoryId ?? 'gundem').then((related) => {
        setCache<CachedNewsDetail>(
          newsDetailCacheKey(postId),
          { post: initialPost, suggested: related },
          CACHE_TTL.LONG
        )
      })
      return
    }

    // No cache, no initialPost — full client fetch
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId])

  if (loading) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-[rgb(var(--color-brand))]" />
        <p className="text-sm text-[rgb(var(--color-muted))]">Haber yükleniyor...</p>
      </div>
    )
  }

  if (error || !post) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-8 text-center">
        <AlertCircle className="mx-auto mb-3 h-10 w-10 text-red-400" />
        <p className="font-semibold text-[rgb(var(--color-text))]">
          {error ?? 'Haber bulunamadı'}
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => load()}
            className="inline-flex items-center gap-2 rounded-full bg-[rgb(var(--color-brand))] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            <RefreshCw className="h-4 w-4" />
            Tekrar dene
          </button>
          <Link
            href={ROUTES.FEED}
            className="inline-flex items-center gap-2 rounded-full border border-[rgb(var(--color-border))] px-4 py-2 text-sm font-semibold text-[rgb(var(--color-text))] hover:bg-[rgb(var(--color-nav-hover))]"
          >
            <ArrowLeft className="h-4 w-4" />
            Haberlere dön
          </Link>
        </div>
      </div>
    )
  }

  return <NewsArticleLayout post={post} suggested={suggested} />
}
