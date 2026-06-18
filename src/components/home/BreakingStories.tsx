'use client'

import Link from 'next/link'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { Zap } from 'lucide-react'
import { ROUTES } from '@/constants/routes'
import { FEED_FALLBACK_LOGO } from '@/lib/feedMediaUtils'
import { newsItemDetailHref } from '@/lib/newsItemUtils'
import type { NewsItem } from '@/types/newsItem'

interface BreakingStoriesProps {
  items: NewsItem[]
}

function StoryCard({ item, priority = false }: { item: NewsItem; priority?: boolean }) {
  const href = newsItemDetailHref(item)
  const image = item.imageUrl || FEED_FALLBACK_LOGO

  return (
    <Link
      href={href}
      className="relative h-[220px] w-[124px] shrink-0 snap-start overflow-hidden rounded-2xl bg-neutral-900"
      style={{ aspectRatio: '9/16' }}
    >
      <SafeNewsImage
        src={image}
        alt={item.title}
        fill
        sizes="124px"
        priority={priority}
        className="object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-black/10" />
      <div className="absolute left-2 top-2 rounded bg-red-600 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-white">
        Son Dakika
      </div>
      <p className="absolute bottom-0 left-0 right-0 line-clamp-2 px-2.5 pb-3 text-[11px] font-bold leading-snug text-white">
        {item.title}
      </p>
    </Link>
  )
}

export function BreakingStories({ items }: BreakingStoriesProps) {
  return (
    <section className="home-section" aria-label="Son dakika hikayeleri">
      <div className="home-section-header">
        <Zap className="h-4 w-4 text-red-500" />
        <h2 className="home-section-title">Son Dakika</h2>
      </div>

      {items.length === 0 ? (
        <div className="mx-1 rounded-2xl border border-dashed border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-4 py-8 text-center">
          <p className="text-sm font-medium text-[rgb(var(--color-muted))]">
            Şu an aktif son dakika haberi yok.
          </p>
        </div>
      ) : (
        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 scrollbar-hide snap-x snap-mandatory">
          <Link
            href={ROUTES.CATEGORY('son-dakika')}
            className="relative flex h-[220px] w-[124px] shrink-0 snap-start flex-col items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-red-600 via-red-700 to-red-900 p-3 text-center"
            style={{ aspectRatio: '9/16' }}
          >
            <Zap className="mb-2 h-8 w-8 text-white" />
            <span className="text-sm font-black uppercase leading-tight text-white">Tüm Son Dakika</span>
          </Link>
          {items.map((item, index) => (
            <StoryCard key={item.id} item={item} priority={index === 0} />
          ))}
        </div>
      )}
    </section>
  )
}
