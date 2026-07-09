'use client'

import Link from 'next/link'
import { Play } from 'lucide-react'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { FEED_FALLBACK_LOGO } from '@/lib/feedMediaUtils'
import {
  categoryPostHref,
  categoryPostImage,
  categoryPostSummary,
} from '@/components/home/desktop/categoryPostUtils'
import { formatNewsDateBbc } from '@/components/home/desktop/formatNewsDate'
import { DesktopSectionHeader } from '@/components/home/desktop/DesktopSectionHeader'
import { newsItemDetailHref } from '@/lib/newsItemUtils'
import { hasVideoContent } from '@/lib/postUtils'
import type { NewsItem } from '@/types/newsItem'
import type { TimelinePost } from '@/types/post'

interface MoreRowFields {
  id: string
  title: string
  href: string
  image: string
  summary: string
  iso: string
  dateLabel: string | null
  isVideo: boolean
}

function fieldsFromPost(post: TimelinePost): MoreRowFields {
  const raw = post.publishedAt ?? post.createdAt
  const iso = typeof raw === 'number' ? new Date(raw).toISOString() : String(raw)
  return {
    id: post.id,
    title: post.title,
    href: categoryPostHref(post),
    image: categoryPostImage(post) || FEED_FALLBACK_LOGO,
    summary: categoryPostSummary(post),
    iso,
    dateLabel: formatNewsDateBbc(raw),
    isVideo: hasVideoContent(post),
  }
}

function fieldsFromNewsItem(item: NewsItem): MoreRowFields {
  const iso = item.publishedAt ?? item.createdAt ?? new Date().toISOString()
  return {
    id: item.id,
    title: item.title,
    href: newsItemDetailHref(item),
    image: item.imageUrl || FEED_FALLBACK_LOGO,
    summary: (item.description ?? '').trim(),
    iso,
    dateLabel: formatNewsDateBbc(iso),
    isVideo: !!item.videoUrl,
  }
}

function MoreRow({ fields }: { fields: MoreRowFields }) {
  return (
    <article className="grid grid-cols-12 gap-x-6 gap-y-3 border-b border-[rgb(var(--color-border))] py-6 last:border-b-0">
      <div className="col-span-12 sm:col-span-2 lg:col-span-2">
        <time className="text-sm text-[rgb(var(--color-muted))]" dateTime={fields.iso}>
          {fields.dateLabel ?? '—'}
        </time>
      </div>
      <div className="col-span-12 sm:col-span-7 lg:col-span-7 min-w-0">
        <Link href={fields.href} className="group block">
          <h3 className="font-serif text-lg font-bold leading-snug text-[rgb(var(--color-text))] group-hover:underline md:text-xl">
            {fields.title}
          </h3>
          {fields.summary ? (
            <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-[rgb(var(--color-muted))]">{fields.summary}</p>
          ) : null}
        </Link>
      </div>
      <div className="col-span-12 sm:col-span-3 lg:col-span-3 sm:col-start-auto">
        <Link href={fields.href} className="group relative block aspect-[16/10] overflow-hidden bg-[rgb(var(--color-border))]">
          <SafeNewsImage
            src={fields.image}
            alt={fields.title}
            fill
            sizes="240px"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
          {fields.isVideo ? (
            <span className="absolute bottom-2 left-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white">
              <Play className="h-3.5 w-3.5 fill-white" />
            </span>
          ) : null}
        </Link>
      </div>
    </article>
  )
}

interface DesktopMoreListProps {
  posts?: TimelinePost[]
  newsItems?: NewsItem[]
  title?: string
  href?: string
  loadingMore?: boolean
  sentinelRef?: React.RefObject<HTMLDivElement | null>
}

export function DesktopMoreList({
  posts,
  newsItems,
  title = 'Daha Fazla',
  href,
  loadingMore,
  sentinelRef,
}: DesktopMoreListProps) {
  const rows = posts?.map(fieldsFromPost) ?? newsItems?.map(fieldsFromNewsItem) ?? []
  if (rows.length === 0) return null

  return (
    <section className="mb-10" aria-label="Daha fazla haber">
      <DesktopSectionHeader title={title} href={href} />
      <div>
        {rows.map((fields) => (
          <MoreRow key={fields.id} fields={fields} />
        ))}
      </div>
      {loadingMore ? (
        <p className="py-4 text-center text-sm text-[rgb(var(--color-muted))]">Yükleniyor…</p>
      ) : null}
      {sentinelRef ? <div ref={sentinelRef} className="h-1" aria-hidden /> : null}
    </section>
  )
}
