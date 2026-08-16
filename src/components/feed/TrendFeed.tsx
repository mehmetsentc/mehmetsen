import Link from 'next/link'
import { Flame } from 'lucide-react'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { FEED_FALLBACK_LOGO } from '@/lib/feedMediaUtils'
import { newsItemCategoryLabel, newsItemDetailHref } from '@/lib/newsItemUtils'
import { formatNewsDateBbc } from '@/components/home/desktop/formatNewsDate'
import type { NewsItem } from '@/types/newsItem'

interface TrendFeedProps {
  items: NewsItem[]
  /** Web gazete düzeninde üst başlık dışarıdan verilir */
  hideHeader?: boolean
}

function formatDate(value?: string): string | null {
  return formatNewsDateBbc(value)
}

export function TrendFeed({ items, hideHeader = false }: TrendFeedProps) {
  if (items.length === 0) {
    return (
      <div className="surface-card border-dashed py-16 text-center">
        <Flame className="mx-auto h-10 w-10 text-[rgb(var(--color-muted))]" />
        <p className="mt-4 font-semibold text-[rgb(var(--color-text))]">
          Şu an trend haber bulunamadı
        </p>
        <p className="mt-1 text-sm text-[rgb(var(--color-muted))]">
          Yeni haberler yayınlandıkça burada görünecek.
        </p>
      </div>
    )
  }

  return (
    <div className={hideHeader ? 'w-full pb-6' : 'mx-auto w-full max-w-3xl pb-6'}>
      {!hideHeader ? (
      <div className="mb-4 flex items-center gap-2 px-1">
        <Flame className="h-5 w-5 text-[rgb(var(--color-brand))]" />
        <h2 className="text-lg font-black text-[rgb(var(--color-text))]">Trend Haberler</h2>
        <span className="rounded-full bg-[rgb(var(--color-brand))]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[rgb(var(--color-brand))]">
          Canlı
        </span>
      </div>
      ) : null}

      <div className={hideHeader ? 'grid grid-cols-2 gap-6 xl:grid-cols-3' : 'space-y-4'}>
        {items.map((item, index) => {
          const image = item.imageUrl || FEED_FALLBACK_LOGO
          const rank = index + 1
          const dateLabel = formatDate(item.publishedAt ?? item.createdAt)

          return (
            <article
              key={item.id}
              className="overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] shadow-sm"
            >
              <Link href={newsItemDetailHref(item)} className="block">
                <div className="relative aspect-video w-full overflow-hidden bg-[rgb(var(--color-border))]">
                  <SafeNewsImage
                    src={image}
                    alt={item.title}
                    fill
                    sizes="(max-width: 768px) 100vw, 720px"
                    priority={index === 0}
                    className="object-cover"
                  />
                  <span
                    className="absolute left-3 top-3 inline-flex h-8 min-w-[32px] items-center justify-center rounded-full bg-[rgb(var(--color-brand))] px-2.5 text-sm font-black text-white shadow-md"
                    aria-label={`Trend sırası ${rank}`}
                  >
                    #{rank}
                  </span>
                </div>
                <div className="p-4">
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-[rgb(var(--color-muted))]">
                    <span className="rounded bg-[rgb(var(--color-brand))]/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-[rgb(var(--color-brand))]">
                      {newsItemCategoryLabel(item)}
                    </span>
                    {dateLabel ? <span>{dateLabel}</span> : null}
                  </div>
                  <h3 className="line-clamp-3 text-lg font-black leading-snug text-[rgb(var(--color-text))] md:text-xl">
                    {item.title}
                  </h3>
                </div>
              </Link>
            </article>
          )
        })}
      </div>
    </div>
  )
}
