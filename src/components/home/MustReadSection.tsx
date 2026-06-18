import Link from 'next/link'
import Image from 'next/image'
import { FEED_FALLBACK_LOGO } from '@/lib/feedMediaUtils'
import { newsItemDetailHref } from '@/lib/newsItemUtils'
import type { NewsItem } from '@/types/newsItem'

interface MustReadSectionProps {
  items: NewsItem[]
}

export function MustReadSection({ items }: MustReadSectionProps) {
  if (items.length === 0) return null

  return (
    <section className="home-section" aria-label="Gözden Kaçmasın">
      <div className="home-rail-title">
        <span className="home-rail-accent" aria-hidden />
        <h2 className="text-lg font-black text-[rgb(var(--color-text))]">Gözden Kaçmasın</h2>
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
              <div className="relative h-24 w-32 shrink-0 overflow-hidden rounded-xl bg-neutral-100">
                <Image src={image} alt={item.title} fill sizes="128px" className="object-cover" />
              </div>
              <div className="flex min-w-0 flex-1 flex-col justify-center py-1">
                <h3 className="line-clamp-3 text-base font-black leading-snug text-[rgb(var(--color-text))]">
                  {item.title}
                </h3>
                {typeof item.views === 'number' && item.views > 0 ? (
                  <p className="mt-1 text-xs font-semibold text-[rgb(var(--color-muted))]">
                    {item.views.toLocaleString('tr-TR')} görüntülenme
                  </p>
                ) : null}
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
