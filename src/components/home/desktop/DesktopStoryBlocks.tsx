'use client'

import Link from 'next/link'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { FEED_FALLBACK_LOGO } from '@/lib/feedMediaUtils'
import { newsItemCategoryLabel, newsItemDetailHref } from '@/lib/newsItemUtils'
import { formatNewsDateBbc } from '@/components/home/desktop/formatNewsDate'
import { cn } from '@/lib/utils'
import type { NewsItem } from '@/types/newsItem'

function StoryCategoryBadge({ item, className }: { item: NewsItem; className?: string }) {
  const label = newsItemCategoryLabel(item)
  if (!label) return null

  return (
    <span
      className={cn(
        'inline-block text-[11px] font-black uppercase tracking-[0.1em] text-[rgb(var(--color-brand))]',
        className
      )}
    >
      {label}
    </span>
  )
}

type NewsBadgeType = 'breaking' | 'featured'

function detectBadge(item: NewsItem): NewsBadgeType | null {
  if (item.breaking) return 'breaking'
  if (item.featured) return 'featured'
  return null
}

const BADGE_CONFIG: Record<NewsBadgeType, { label: string; className: string }> = {
  breaking: {
    label: 'Son Dakika',
    className: 'bg-red-600 text-white',
  },
  featured: {
    label: 'Özel Haber',
    className: 'bg-[rgb(var(--color-brand))] text-white',
  },
}

function NewsTypeBadge({ item, className }: { item: NewsItem; className?: string }) {
  const type = detectBadge(item)
  if (!type) return null
  const { label, className: badgeCls } = BADGE_CONFIG[type]

  return (
    <span
      className={cn(
        'inline-block rounded-sm px-1.5 py-0.5 text-[10px] font-black uppercase tracking-[0.08em]',
        badgeCls,
        className
      )}
    >
      {label}
    </span>
  )
}

function estimateReadingMinutes(item: NewsItem): number | null {
  if (typeof item.readingMinutes === 'number' && item.readingMinutes > 0) {
    return item.readingMinutes
  }
  const text = item.content ?? item.description ?? ''
  if (!text) return null
  const wordCount = text.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).filter(Boolean).length
  const minutes = Math.ceil(wordCount / 200)
  return minutes >= 1 ? minutes : null
}

function StoryMeta({ item, className }: { item: NewsItem; className?: string }) {
  const time = formatNewsDateBbc(item.publishedAt ?? item.createdAt)
  const mins = estimateReadingMinutes(item)

  if (!time && !mins) return null

  return (
    <p className={cn('flex items-center gap-2 text-xs text-[rgb(var(--color-muted))]', className)}>
      {time ? <span>{time}</span> : null}
      {time && mins ? <span aria-hidden>·</span> : null}
      {mins ? (
        <span className="font-semibold uppercase tracking-wide text-[rgb(var(--color-muted))]">
          {mins} dk okuma
        </span>
      ) : null}
    </p>
  )
}

const HEADLINE_SIZES = {
  sm: 'text-sm font-bold leading-snug',
  md: 'text-base font-bold leading-snug',
  lg: 'text-lg font-bold leading-tight',
  xl: 'text-xl font-bold leading-tight',
  hero: 'text-2xl font-bold leading-tight xl:text-3xl xl:leading-tight',
} as const

function HeadlineText({
  item,
  size = 'md',
  serif = false,
  className,
}: {
  item: NewsItem
  size?: keyof typeof HEADLINE_SIZES
  serif?: boolean
  className?: string
}) {
  return (
    <h3
      className={cn(
        HEADLINE_SIZES[size],
        serif ? 'font-serif' : '',
        'break-words text-[rgb(var(--color-text))] decoration-2 underline-offset-2 group-hover:underline',
        className
      )}
    >
      {item.title}
    </h3>
  )
}

function Headline({
  item,
  size = 'md',
  serif = false,
}: {
  item: NewsItem
  size?: keyof typeof HEADLINE_SIZES
  serif?: boolean
}) {
  return (
    <Link href={newsItemDetailHref(item)} className="group block min-w-0">
      <HeadlineText item={item} size={size} serif={serif} />
    </Link>
  )
}

export function HeroStory({ item, priority = false }: { item: NewsItem; priority?: boolean }) {
  return (
    <article>
      <Link href={newsItemDetailHref(item)} className="group block">
        <div className="relative mb-4 aspect-[16/10] overflow-hidden bg-[rgb(var(--color-border))]">
          <SafeNewsImage
            src={item.imageUrl || FEED_FALLBACK_LOGO}
            alt={item.title}
            fill
            sizes="(max-width: 1280px) 50vw, 640px"
            priority={priority}
            className="object-cover transition-transform duration-300 group-hover:scale-[1.01]"
          />
        </div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <NewsTypeBadge item={item} />
          <StoryCategoryBadge item={item} />
        </div>
        <Headline item={item} size="hero" serif />
        {item.description ? (
          <p className="mt-3 line-clamp-3 text-[15px] leading-relaxed text-[rgb(var(--color-muted))]">
            {item.description}
          </p>
        ) : null}
        <StoryMeta item={item} className="mt-3" />
      </Link>
    </article>
  )
}

/** BBC hero: geniş manşet görseli — satır yüksekliğine uzamaz */
export function HeroImageOnly({
  item,
  priority = false,
  aspect = 'hero',
}: {
  item: NewsItem
  priority?: boolean
  aspect?: 'hero' | 'wide'
}) {
  const aspectCls = aspect === 'wide' ? 'aspect-[16/9]' : 'aspect-[16/10]'

  return (
    <article className="min-w-0">
      <Link href={newsItemDetailHref(item)} className="group block">
        <div className={cn('relative w-full overflow-hidden bg-[rgb(var(--color-border))]', aspectCls)}>
          <SafeNewsImage
            src={item.imageUrl || FEED_FALLBACK_LOGO}
            alt={item.title}
            fill
            sizes="(max-width: 1280px) 50vw, 960px"
            priority={priority}
            className="object-cover transition-transform duration-300 group-hover:scale-[1.01]"
          />
        </div>
      </Link>
    </article>
  )
}

/** Manşet yan sütun: yatay kompakt kart — 2–3 haber sol lead yüksekliğine yaklaşır */
export function RightFeatureStory({ item, live = false }: { item: NewsItem; live?: boolean }) {
  return (
    <article className="min-w-0 border-b border-[rgb(var(--color-border))] py-3.5 last:border-b-0 last:pb-0 first:pt-0">
      {live ? (
        <span className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-red-600">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-600" />
          Canlı
        </span>
      ) : null}
      <Link href={newsItemDetailHref(item)} className="group flex min-w-0 gap-3.5">
        <div className="relative aspect-[4/3] w-[7.25rem] shrink-0 overflow-hidden bg-[rgb(var(--color-border))] sm:w-[8.5rem]">
          <SafeNewsImage
            src={item.imageUrl || FEED_FALLBACK_LOGO}
            alt={item.title}
            fill
            sizes="140px"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        </div>
        <div className="min-w-0 flex-1 self-center">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <NewsTypeBadge item={item} />
            <StoryCategoryBadge item={item} />
          </div>
          <HeadlineText item={item} size="md" serif />
          {item.description ? (
            <p className="mt-1.5 line-clamp-2 break-words text-[13px] leading-snug text-[rgb(var(--color-text)_/_0.72)]">
              {item.description}
            </p>
          ) : null}
          <StoryMeta item={item} className="mt-1.5" />
        </div>
      </Link>
    </article>
  )
}

/** BBC yatay manşet şeridi — sadece başlık */
export function QuickHeadlineStrip({ items }: { items: NewsItem[] }) {
  if (items.length === 0) return null

  return (
    <nav className="mb-10 border-y border-[rgb(var(--color-border))] py-4" aria-label="Hızlı başlıklar">
      <ul className="flex flex-wrap divide-x divide-[rgb(var(--color-border))]">
        {items.map((item) => (
          <li key={item.id} className="min-w-0 flex-1 px-4 first:pl-0 last:pr-0">
            <Link
              href={newsItemDetailHref(item)}
              className="line-clamp-3 text-sm font-bold leading-snug text-[rgb(var(--color-text))] hover:underline"
            >
              {item.title}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export function ImageStory({
  item,
  priority = false,
  aspect = 'video',
  showSummary = true,
}: {
  item: NewsItem
  priority?: boolean
  aspect?: 'video' | 'square' | 'wide' | 'portrait'
  showSummary?: boolean
}) {
  const aspectCls = {
    video: 'aspect-video',
    square: 'aspect-square',
    wide: 'aspect-[16/9]',
    portrait: 'aspect-[3/4]',
  }[aspect]

  return (
    <article className="min-w-0">
      <Link href={newsItemDetailHref(item)} className="group block min-w-0">
        <div className={cn('relative mb-3 w-full overflow-hidden bg-[rgb(var(--color-border))]', aspectCls)}>
          <SafeNewsImage
            src={item.imageUrl || FEED_FALLBACK_LOGO}
            alt={item.title}
            fill
            sizes="(max-width: 1280px) 20vw, 380px"
            priority={priority}
            className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        </div>
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
          <NewsTypeBadge item={item} />
          <StoryCategoryBadge item={item} />
        </div>
        <Headline item={item} size="md" />
        {showSummary && item.description ? (
          <p className="mt-2 line-clamp-3 break-words text-sm leading-relaxed text-[rgb(var(--color-muted))]">
            {item.description}
          </p>
        ) : null}
        <StoryMeta item={item} className="mt-2" />
      </Link>
    </article>
  )
}

export function TextLeadStory({
  item,
  size = 'lg',
  dropCap = false,
}: {
  item: NewsItem
  size?: 'md' | 'lg' | 'hero'
  dropCap?: boolean
}) {
  return (
    <article className="min-w-0">
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        {item.breaking ? <span className="nl-kicker">Son Dakika</span> : null}
        <NewsTypeBadge item={item} />
        <StoryCategoryBadge item={item} />
      </div>
      <Headline item={item} size={size === 'hero' ? 'hero' : size} serif />
      {item.description ? (
        <p
          className={
            dropCap
              ? 'nl-dropcap mt-3 line-clamp-5 break-words text-[15px] leading-relaxed text-[rgb(var(--color-text)_/_0.78)]'
              : 'mt-3 line-clamp-4 break-words text-[15px] leading-relaxed text-[rgb(var(--color-text)_/_0.78)]'
          }
        >
          {item.description}
        </p>
      ) : null}
      <StoryMeta item={item} className="mt-3" />
    </article>
  )
}

export function SidebarTextStory({ item, live = false }: { item: NewsItem; live?: boolean }) {
  return (
    <article className="min-w-0 border-b border-[rgb(var(--color-border))] py-3 last:border-b-0">
      {live ? (
        <span className="mb-1.5 inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-red-600">
          <span className="h-1.5 w-1.5 rounded-full bg-red-600 animate-pulse" />
          Canlı
        </span>
      ) : null}
      <div className="mb-1 flex flex-wrap items-center gap-1.5">
        <NewsTypeBadge item={item} />
        <StoryCategoryBadge item={item} />
      </div>
      <Headline item={item} size="sm" />
      <StoryMeta item={item} className="mt-1.5" />
    </article>
  )
}

export function NumberedStory({ item, rank }: { item: NewsItem; rank: number }) {
  return (
    <article className="flex gap-3 border-b border-[rgb(var(--color-border))]/60 pb-4">
      <span className="w-7 shrink-0 text-2xl font-light leading-none text-[rgb(var(--color-muted))]">
        {rank}
      </span>
      <div className="min-w-0">
        <StoryCategoryBadge item={item} className="mb-1" />
        <Headline item={item} size="sm" />
        <StoryMeta item={item} className="mt-1" />
      </div>
    </article>
  )
}

export function DualImageStory({ items }: { items: NewsItem[] }) {
  if (items.length === 0) return null
  const lead = items[0]!

  return (
    <article>
      <Link href={newsItemDetailHref(lead)} className="group block">
        <div className="mb-3 grid grid-cols-2 gap-1">
          {items.slice(0, 2).map((item, i) => (
            <div key={item.id} className="relative aspect-[3/4] overflow-hidden bg-[rgb(var(--color-border))]">
              <SafeNewsImage
                src={item.imageUrl || FEED_FALLBACK_LOGO}
                alt={item.title}
                fill
                sizes="200px"
                priority={i === 0}
                className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              />
            </div>
          ))}
        </div>
        <Headline item={lead} size="lg" serif />
        {lead.description ? (
          <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-[rgb(var(--color-muted))]">
            {lead.description}
          </p>
        ) : null}
        <StoryMeta item={lead} className="mt-2" />
      </Link>
    </article>
  )
}
