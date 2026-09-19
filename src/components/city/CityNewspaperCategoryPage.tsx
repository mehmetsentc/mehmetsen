import Link from 'next/link'
import { CityNewspaperFooter } from '@/components/city/CityNewspaperFooter'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { newsItemDetailHref } from '@/lib/newsItemUtils'
import type { HomeFeedInitialData, NewsItem } from '@/types/newsItem'

function uniqueNews(items: NewsItem[]) {
  const seen = new Set<string>()
  const out: NewsItem[] = []
  for (const item of items) {
    if (!item?.id || seen.has(item.id)) continue
    seen.add(item.id)
    out.push(item)
  }
  return out
}

/**
 * City category / district pages. Must not import HomeFeed or SmartFeed —
 * those two share a webpack graph under city-site and throw undefined.call.
 */
export function CityNewspaperCategoryPage({
  homeFeedData,
  cityName,
  sectionTitle,
}: {
  homeFeedData: HomeFeedInitialData
  cityName: string
  sectionTitle?: string
}) {
  const items = uniqueNews([
    ...(homeFeedData.featured ?? []),
    ...(homeFeedData.latest ?? []),
  ]).slice(0, 36)
  const heading = sectionTitle ?? `${cityName} Haberleri`

  return (
    <section className="pb-10" data-testid="city-desktop-category-grid">
      <h1 className="mb-6 font-serif text-3xl font-black text-[rgb(var(--color-text))]">{heading}</h1>
      {items.length === 0 ? (
        <p className="text-[rgb(var(--color-text-secondary))]">Bu kategoride henüz haber yok.</p>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <article key={item.id} className="min-w-0">
              <Link href={newsItemDetailHref(item)} className="block">
                {item.imageUrl ? (
                  <span className="relative mb-3 block aspect-[16/10] overflow-hidden bg-[rgb(var(--color-border))]">
                    <SafeNewsImage
                      src={item.imageUrl}
                      alt=""
                      fill
                      sizes="360px"
                      className="object-cover"
                    />
                  </span>
                ) : null}
                <h2 className="font-serif text-lg font-bold leading-snug text-[rgb(var(--color-text))]">
                  {item.title}
                </h2>
              </Link>
            </article>
          ))}
        </div>
      )}
      <div className="hidden lg:block">
        <CityNewspaperFooter cityName={cityName} />
      </div>
    </section>
  )
}
