'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { FEED_FALLBACK_LOGO } from '@/lib/feedMediaUtils'
import { newsItemCategoryLabel, newsItemDetailHref } from '@/lib/newsItemUtils'
import { getCategoryLabel } from '@/lib/newsMapper'
import { ROUTES } from '@/constants/routes'
import { HOME_CATEGORY_RAILS, type HomeFeedInitialData } from '@/types/newsItem'
import type { NewsItem } from '@/types/newsItem'
import { formatNewsDate } from '@/components/home/desktop/formatNewsDate'

interface DesktopHomeFeedProps {
  data: HomeFeedInitialData
}

function HeadlineLink({ item, size = 'md' }: { item: NewsItem; size?: 'sm' | 'md' | 'lg' | 'hero' }) {
  const titleCls = {
    sm: 'text-sm font-semibold leading-snug',
    md: 'text-base font-bold leading-snug',
    lg: 'text-xl font-bold leading-tight',
    hero: 'text-2xl font-bold leading-tight xl:text-3xl',
  }[size]

  return (
    <Link href={newsItemDetailHref(item)} className="group block">
      <h3 className={`${titleCls} text-[rgb(var(--color-text))] group-hover:underline decoration-2 underline-offset-2`}>
        {item.title}
      </h3>
    </Link>
  )
}

function ImageStory({
  item,
  priority = false,
  aspect = 'video',
}: {
  item: NewsItem
  priority?: boolean
  aspect?: 'video' | 'square' | 'wide'
}) {
  const image = item.imageUrl || FEED_FALLBACK_LOGO
  const aspectCls = aspect === 'square' ? 'aspect-[4/3]' : aspect === 'wide' ? 'aspect-[16/10]' : 'aspect-video'

  return (
    <article>
      <Link href={newsItemDetailHref(item)} className="group block">
        <div className={`relative mb-3 overflow-hidden bg-[rgb(var(--color-border))] ${aspectCls}`}>
          <SafeNewsImage
            src={image}
            alt={item.title}
            fill
            sizes="(max-width: 1280px) 33vw, 400px"
            priority={priority}
            className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        </div>
        <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[rgb(var(--color-brand))]">
          {newsItemCategoryLabel(item)}
        </p>
        <HeadlineLink item={item} size="md" />
        {item.description ? (
          <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-[rgb(var(--color-muted))]">
            {item.description}
          </p>
        ) : null}
        {formatNewsDate(item.publishedAt ?? item.createdAt) ? (
          <p className="mt-2 text-xs text-[rgb(var(--color-muted))]">
            {formatNewsDate(item.publishedAt ?? item.createdAt)}
          </p>
        ) : null}
      </Link>
    </article>
  )
}

function SidebarHeadline({ item, live = false }: { item: NewsItem; live?: boolean }) {
  return (
    <article className="border-b border-[rgb(var(--color-border))] py-3 last:border-b-0">
      {live ? (
        <span className="mb-1 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-red-600">
          <span className="h-1.5 w-1.5 rounded-full bg-red-600 animate-pulse" />
          Canlı
        </span>
      ) : (
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">
          {newsItemCategoryLabel(item)}
        </p>
      )}
      <HeadlineLink item={item} size="sm" />
    </article>
  )
}

export function DesktopHomeFeed({ data }: DesktopHomeFeedProps) {
  const { breaking, featured, latest, trending, mostRead, categoryRails } = data

  const breakingIds = useMemo(() => new Set(breaking.map((b) => b.id)), [breaking])
  const trendingIds = useMemo(() => new Set(trending.map((t) => t.id)), [trending])
  const featuredIds = useMemo(() => new Set(featured.map((f) => f.id)), [featured])

  const pool = useMemo(() => {
    const seen = new Set<string>()
    const merged = [...featured, ...latest]
    const out: NewsItem[] = []
    for (const item of merged) {
      if (seen.has(item.id) || breakingIds.has(item.id)) continue
      seen.add(item.id)
      out.push(item)
    }
    return out
  }, [featured, latest, breakingIds])

  const hero = pool[0]
  const leftFeature = pool[1]
  const sidebarItems = pool.slice(2, 8)
  const secondaryRow = pool.slice(8, 11)
  const lowerStream = useMemo(
    () =>
      latest.filter(
        (item) =>
          !breakingIds.has(item.id) &&
          !trendingIds.has(item.id) &&
          !featuredIds.has(item.id) &&
          item.category !== 'son-dakika'
      ).slice(0, 8),
    [latest, breakingIds, trendingIds, featuredIds]
  )

  const topBreaking = breaking[0]

  return (
    <div className="desktop-home-feed pb-10">
      {topBreaking ? (
        <Link
          href={newsItemDetailHref(topBreaking)}
          className="mb-5 flex items-center gap-3 border-y border-red-200 bg-red-50 px-4 py-2.5 dark:border-red-900/40 dark:bg-red-950/30"
        >
          <span className="shrink-0 rounded bg-red-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
            Son Dakika
          </span>
          <span className="line-clamp-1 text-sm font-semibold text-[rgb(var(--color-text))]">
            {topBreaking.title}
          </span>
        </Link>
      ) : null}

      {hero ? (
        <section className="mb-8 grid grid-cols-12 gap-6 border-b border-[rgb(var(--color-border))] pb-8" aria-label="Manşet">
          <div className="col-span-12 xl:col-span-3">
            {leftFeature ? <ImageStory item={leftFeature} aspect="square" /> : null}
          </div>

          <div className="col-span-12 xl:col-span-6">
            <article>
              <Link href={newsItemDetailHref(hero)} className="group block">
                <div className="relative mb-4 aspect-[16/10] overflow-hidden bg-[rgb(var(--color-border))]">
                  <SafeNewsImage
                    src={hero.imageUrl || FEED_FALLBACK_LOGO}
                    alt={hero.title}
                    fill
                    sizes="(max-width: 1280px) 50vw, 640px"
                    priority
                    className="object-cover transition-transform duration-300 group-hover:scale-[1.01]"
                  />
                </div>
                <p className="mb-2 text-xs font-bold uppercase tracking-widest text-[rgb(var(--color-brand))]">
                  {newsItemCategoryLabel(hero)}
                </p>
                <HeadlineLink item={hero} size="hero" />
                {hero.description ? (
                  <p className="mt-3 max-w-2xl text-base leading-relaxed text-[rgb(var(--color-muted))]">
                    {hero.description}
                  </p>
                ) : null}
              </Link>
            </article>
          </div>

          <aside className="col-span-12 xl:col-span-3 xl:border-l xl:border-[rgb(var(--color-border))] xl:pl-6" aria-label="Gündem">
            <h2 className="mb-2 text-xs font-black uppercase tracking-widest text-[rgb(var(--color-muted))]">
              Gündem
            </h2>
            {sidebarItems.map((item, i) => (
              <SidebarHeadline key={item.id} item={item} live={i === 0 && !!item.breaking} />
            ))}
          </aside>
        </section>
      ) : null}

      {secondaryRow.length > 0 ? (
        <section className="mb-10 grid grid-cols-3 gap-6 border-b border-[rgb(var(--color-border))] pb-10" aria-label="Öne çıkanlar">
          {secondaryRow.map((item) => (
            <ImageStory key={item.id} item={item} aspect="wide" />
          ))}
        </section>
      ) : null}

      {mostRead.length > 0 ? (
        <section className="mb-10" aria-label="Çok okunanlar">
          <div className="mb-4 flex items-end justify-between border-b border-[rgb(var(--color-border))] pb-2">
            <h2 className="font-serif text-xl font-bold text-[rgb(var(--color-text))]">Çok Okunanlar</h2>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-4">
            {mostRead.slice(0, 6).map((item, index) => (
              <div key={item.id} className="flex gap-3 border-b border-[rgb(var(--color-border))]/60 pb-4">
                <span className="w-6 shrink-0 text-2xl font-light text-[rgb(var(--color-muted))]">
                  {index + 1}
                </span>
                <HeadlineLink item={item} size="sm" />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mb-10 grid grid-cols-2 gap-8 xl:grid-cols-3" aria-label="Kategoriler">
        {HOME_CATEGORY_RAILS.slice(0, 6).map((categoryId) => {
          const items = categoryRails[categoryId]
          if (!items?.length) return null
          return (
            <div key={categoryId} className="min-w-0">
              <div className="mb-3 flex items-center justify-between border-b-2 border-[rgb(var(--color-text))] pb-1">
                <h2 className="font-serif text-lg font-bold text-[rgb(var(--color-text))]">
                  {getCategoryLabel(categoryId)}
                </h2>
                <Link
                  href={ROUTES.CATEGORY(categoryId)}
                  className="text-xs font-semibold text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-brand))]"
                >
                  Tümü →
                </Link>
              </div>
              <div className="space-y-4">
                {items.slice(0, 1).map((item) => (
                  <ImageStory key={item.id} item={item} aspect="video" />
                ))}
                {items.slice(1, 4).map((item) => (
                  <SidebarHeadline key={item.id} item={item} />
                ))}
              </div>
            </div>
          )
        })}
      </section>

      {lowerStream.length > 0 ? (
        <section aria-label="Son haberler">
          <div className="mb-4 border-b-2 border-[rgb(var(--color-text))] pb-1">
            <h2 className="font-serif text-xl font-bold text-[rgb(var(--color-text))]">Son Haberler</h2>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-6 xl:grid-cols-4">
            {lowerStream.map((item) => (
              <ImageStory key={item.id} item={item} aspect="video" />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
