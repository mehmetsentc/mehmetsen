'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useMemo } from 'react'
import { Star, ExternalLink, Heart, MessageCircle } from 'lucide-react'
import { usePageState } from '@/hooks/usePageState'
import { PAGE_STATE_KEYS } from '@/lib/stateKeys'
import { ROUTES } from '@/constants/routes'
import { resolveTimelineImageUrl } from '@/lib/feedMediaUtils'
import { formatTimelineRelative } from '@/lib/timelineUtils'
import { formatCount } from '@/lib/postUtils'
import { cn } from '@/lib/utils'
import type { Post } from '@/types/post'

const PLATFORMS = [
  { id: 'all', label: 'Tümü', emoji: '🌟' },
  { id: 'tiktok', label: 'TikTok', emoji: '🎵' },
  { id: 'instagram', label: 'Instagram', emoji: '📸' },
  { id: 'youtube', label: 'YouTube', emoji: '▶️' },
  { id: 'twitch', label: 'Twitch', emoji: '🟣' },
  { id: 'kick', label: 'Kick', emoji: '🟢' },
] as const

type Platform = (typeof PLATFORMS)[number]['id']

function matchesPlatform(post: Post, platform: Platform): boolean {
  if (platform === 'all') return true
  const haystack = [post.title, post.summary, post.content, ...(post.tags ?? [])]
    .join(' ')
    .toLowerCase()
  return haystack.includes(platform)
}

function InfluencerCard({ post }: { post: Post }) {
  const { url: imageUrl, isFallback } = resolveTimelineImageUrl(post)
  const rel = formatTimelineRelative(post.publishedAt)
  const href =
    post.slug && post.slug !== post.id
      ? ROUTES.NEWS_DETAIL(post.slug)
      : ROUTES.POST_DETAIL(post.id)

  return (
    <Link
      href={href}
      className="group overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] transition-all hover:border-[rgb(var(--color-brand))]/40 hover:shadow-md"
    >
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-[rgb(var(--color-border))]">
        {!isFallback && imageUrl ? (
          <Image
            src={imageUrl}
            alt=""
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            sizes="(max-width: 640px) 100vw, 400px"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-pink-600 to-purple-700">
            <Star className="h-10 w-10 text-white/60" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
        {rel ? (
          <span className="absolute bottom-2 right-2.5 text-[10px] font-medium text-white/70">
            {rel}
          </span>
        ) : null}
      </div>

      <div className="p-3">
        <h2 className="line-clamp-2 text-[0.875rem] font-bold leading-snug text-[rgb(var(--color-text))] group-hover:text-[rgb(var(--color-brand))]">
          {post.title}
        </h2>
        {post.summary ? (
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[rgb(var(--color-muted))]">
            {post.summary}
          </p>
        ) : null}
        <div className="mt-2.5 flex items-center gap-3 text-[11px] text-[rgb(var(--color-muted))]">
          {post.likesCount > 0 ? (
            <span className="flex items-center gap-1">
              <Heart className="h-3 w-3" />
              {formatCount(post.likesCount)}
            </span>
          ) : null}
          {post.commentsCount > 0 ? (
            <span className="flex items-center gap-1">
              <MessageCircle className="h-3 w-3" />
              {formatCount(post.commentsCount)}
            </span>
          ) : null}
          {post.source ? (
            <span className="ml-auto flex items-center gap-0.5 truncate">
              <ExternalLink className="h-3 w-3 shrink-0" />
              {post.source}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  )
}

export function InfluencerClient({ initialPosts }: { initialPosts: Post[] }) {
  const [activePlatform, setActivePlatform] = usePageState<Platform>(
    PAGE_STATE_KEYS.influencerPlatform,
    'all'
  )

  const filtered = useMemo(
    () =>
      activePlatform === 'all'
        ? initialPosts
        : initialPosts.filter((p) => matchesPlatform(p, activePlatform)),
    [initialPosts, activePlatform]
  )

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-black tracking-tight text-[rgb(var(--color-text))]">
          <span className="text-[rgb(var(--color-brand))]">⭐</span> Influencer
        </h1>
        <p className="text-xs text-[rgb(var(--color-muted))]">
          Sosyal medya ve influencer haberleri
        </p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {PLATFORMS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setActivePlatform(p.id)}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
              activePlatform === p.id
                ? 'border-[rgb(var(--color-brand))] bg-[rgb(var(--color-brand))]/10 text-[rgb(var(--color-brand))]'
                : 'border-[rgb(var(--color-border))] text-[rgb(var(--color-muted))] hover:border-[rgb(var(--color-brand))]/40'
            )}
          >
            <span>{p.emoji}</span>
            {p.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[rgb(var(--color-border))] py-16 text-center">
          <Star className="mx-auto mb-3 h-8 w-8 text-[rgb(var(--color-muted))]" />
          <p className="text-sm font-semibold text-[rgb(var(--color-text))]">
            {activePlatform === 'all'
              ? 'Henüz influencer haberi yok'
              : `${activePlatform} haberi bulunamadı`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {filtered.map((post) => (
            <InfluencerCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </div>
  )
}
