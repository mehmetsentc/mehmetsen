'use client'

import { getClientAuthToken } from '@/lib/firebase/auth'
import type { FeedItemDto } from '@/types/smartFeed'
import { feedItemToVideoPost, type RankedVideoPost } from './feedItemToVideoPost'

const PAGE = 12

type ApiPage = { items?: FeedItemDto[]; queue?: string[]; rankingVersion?: string | null; error?: string }

/**
 * VIDEO-RANK-1 — /video sayfası: ilk çağrı sıralanmış ilk sayfayı ve kalan id
 * kuyruğunu alır; sonraki çağrılar kuyruğun başındaki sayfayı ister.
 */
export async function fetchRankedVideoPage(opts: {
  category: string | null
  queue: string[] | null
}): Promise<{ posts: RankedVideoPost[]; queue: string[] }> {
  const params = new URLSearchParams()
  let rest: string[] = []
  if (opts.queue) {
    const next = opts.queue.slice(0, PAGE)
    rest = opts.queue.slice(PAGE)
    if (!next.length) return { posts: [], queue: [] }
    params.set('ids', next.join(','))
  } else {
    params.set('limit', String(PAGE))
    if (opts.category) params.set('category', opts.category)
  }
  const headers: Record<string, string> = {}
  try {
    const token = await getClientAuthToken()
    if (token) headers.Authorization = `Bearer ${token}`
  } catch {
    /* anonymous */
  }
  const res = await fetch(`/api/feed/v2/videos?${params}`, { headers, credentials: 'include', cache: 'no-store' })
  if (!res.ok) throw new Error('Video akışı yüklenemedi')
  const body = (await res.json()) as ApiPage
  const posts = (body.items ?? [])
    .map(feedItemToVideoPost)
    .filter((p): p is RankedVideoPost => Boolean(p))
  return { posts, queue: opts.queue ? rest : body.queue ?? [] }
}
