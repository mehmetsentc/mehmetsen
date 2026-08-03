import Link from 'next/link'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { FEED_FALLBACK_LOGO } from '@/lib/feedMediaUtils'
import { newsItemCategoryLabel, newsItemDetailHref } from '@/lib/newsItemUtils'
import type { NewsItem } from '@/types/newsItem'

interface NewsFeedCardProps {
  item: NewsItem
  priority?: boolean
}

function formatDate(value?: string): string | null {
  if (!value) return null
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return null
  return new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed)
}

export function NewsFeedCard({ item, priority = false }: NewsFeedCardProps) {
  const image = item.imageUrl || FEED_FALLBACK_LOGO
  const dateLabel = formatDate(item.publishedAt ?? item.createdAt)

  return (
    <article className="overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] shadow-sm">
      <Link href={newsItemDetailHref(item)} className="block">
        <div className="relative aspect-video w-full overflow-hidden bg-[rgb(var(--color-border))]">
          <SafeNewsImage
            src={image}
            alt={item.title}
            fill
            sizes="(max-width: 768px) 100vw, 720px"
            priority={priority}
            className="object-cover"
          />
          {/* NaHaber watermark */}
          <span className="absolute bottom-2 right-2 rounded px-1.5 py-0.5 text-[9px] font-bold text-white/70 tracking-wide bg-black/20">
            nahaber.com
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
}

interface NewsFeedListProps {
  items: NewsItem[]
}

export function NewsFeedList({ items }: NewsFeedListProps) {
  if (items.length === 0) return null

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <NewsFeedCard key={item.id} item={item} />
      ))}
    </div>
  )
}
