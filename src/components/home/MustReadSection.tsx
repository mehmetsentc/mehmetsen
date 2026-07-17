import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { FEED_FALLBACK_LOGO } from '@/lib/feedMediaUtils'
import { newsItemDetailHref } from '@/lib/newsItemUtils'
import { ROUTES } from '@/constants/routes'
import type { NewsItem } from '@/types/newsItem'

interface MustReadSectionProps {
  items: NewsItem[]
}

export function MustReadSection({ items }: MustReadSectionProps) {
  if (items.length === 0) return null

  return (
    <section className="home-section" aria-label="Gözden Kaçmasın">
      <div className="home-rail-title justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <span className="home-rail-accent shrink-0" aria-hidden />
          <h2 className="truncate text-lg font-black text-[rgb(var(--color-text))]">Gözden Kaçmasın</h2>
        </div>
        <Link
          href={ROUTES.MOST_READ}
          className="flex shrink-0 items-center gap-0.5 text-xs font-semibold text-[rgb(var(--color-brand))]"
        >
          Tümünü gör
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>

      <div className="space-y-3">
        {items.map((item) => {
          const image = item.imageUrl || FEED_FALLBACK_LOGO
          return (
            <Link
              key={item.id}
              href={newsItemDetailHref(item)}
              className="flex gap-3 overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-2"
            >
              <div className="relative h-24 w-32 shrink-0 overflow-hidden rounded-xl bg-[rgb(var(--color-border))]">
                <SafeNewsImage src={image} alt={item.title} fill sizes="128px" className="object-cover" />
              </div>
              <div className="flex min-w-0 flex-1 flex-col justify-center py-1">
                <h3 className="line-clamp-3 text-base font-black leading-snug text-[rgb(var(--color-text))]">
                  {item.title}
                </h3>
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
