import Link from 'next/link'
import { BadgeCheck, ExternalLink, Globe, MapPin } from 'lucide-react'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/lib/utils'
import type { PublicPublisherRecord, PublisherArticleItem } from '@/types/publisher'
import type { ResolvedPublisherLayout } from '@/types/publisherLayout'
import { spanForSize } from '@/types/publisherLayout'
import { isProfileAdSlotsEnabled, isPublisherAdPublicListingEnabled } from '@/lib/publisher/adInventoryFlags'
import {
  isPublisherAdServingEnabled,
  isPublisherSelfManagedAdsEnabled,
} from '@/lib/publisher/selfManagedAdFlags'
import { PublisherAdSlotPlaceholder } from '@/components/publisher/PublisherAdSlotPlaceholder'
import { PublisherAdRenderer } from '@/components/publisher/PublisherAdRenderer'
import type { PublisherAdInventoryRecord } from '@/types/publisherAdInventory'
import type { ResolvedPublisherAd } from '@/types/publisherManagedAds'

function ArticleCard({
  article,
  size,
}: {
  article: {
    slug: string
    title: string
    summary: string | null
    thumbnailUrl: string | null
    publishedAt: Date | null
    categoryName?: string | null
    missing?: boolean
  }
  size: string
}) {
  if (article.missing) {
    return (
      <div className="rounded-lg border border-dashed border-[rgb(var(--color-border))] p-4 text-sm text-[rgb(var(--color-muted))]">
        Bu haber artık mevcut değil.
      </div>
    )
  }

  const dense = size === 'COMPACT'
  const hero = size === 'HERO' || size === 'FULL'

  return (
    <Link
      href={ROUTES.NEWS_DETAIL(article.slug)}
      className={cn(
        'group block overflow-hidden rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] transition hover:border-[rgb(var(--color-brand))]/40',
        hero && 'sm:col-span-12'
      )}
    >
      {article.thumbnailUrl ? (
        <div className={cn('relative w-full overflow-hidden', hero ? 'aspect-[16/9]' : dense ? 'aspect-[4/3]' : 'aspect-video')}>
          <SafeNewsImage src={article.thumbnailUrl} alt="" fill className="object-cover transition group-hover:scale-[1.02]" />
        </div>
      ) : (
        <div className={cn('flex items-center justify-center bg-[rgb(var(--color-bg))] text-[rgb(var(--color-muted))]', hero ? 'aspect-[16/9]' : 'aspect-video')}>
          <span className="text-xs font-bold uppercase tracking-wide">Görsel yok</span>
        </div>
      )}
      <div className={cn('p-3', dense && 'p-2')}>
        {article.categoryName ? (
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[rgb(var(--color-brand))]">
            {article.categoryName}
          </p>
        ) : null}
        <h3 className={cn('font-bold leading-snug text-[rgb(var(--color-text))]', dense ? 'text-sm line-clamp-2' : 'line-clamp-3')}>
          {article.title}
        </h3>
        {!dense && article.summary ? (
          <p className="mt-1 line-clamp-2 text-xs text-[rgb(var(--color-muted))]">{article.summary}</p>
        ) : null}
        {article.publishedAt ? (
          <time dateTime={article.publishedAt.toISOString()} className="mt-2 block text-[10px] text-[rgb(var(--color-muted))]">
            {article.publishedAt.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
          </time>
        ) : null}
      </div>
    </Link>
  )
}

function ChronologicalFallback({ articles }: { articles: PublisherArticleItem[] }) {
  return (
    <section>
      <h2 className="mb-4 text-lg font-black text-[rgb(var(--color-text))]">Haberler</h2>
      {articles.length === 0 ? (
        <p className="text-sm text-[rgb(var(--color-muted))]">Henüz yayınlanmış haber bulunamadı.</p>
      ) : (
        <ul className="divide-y divide-[rgb(var(--color-border))]">
          {articles.map((article) => (
            <li key={article.id}>
              <ArticleCard article={article} size="STANDARD" />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function PublisherLayoutRenderer({
  publisher,
  layout,
  fallbackArticles,
  adInventoryById,
  resolvedAdsByInventoryId,
}: {
  publisher: PublicPublisherRecord
  layout: ResolvedPublisherLayout | null
  fallbackArticles: PublisherArticleItem[]
  /** Optional inventory map for AD_SLOT items (id → record). */
  adInventoryById?: Map<string, PublisherAdInventoryRecord>
  /** Self-managed active creatives keyed by inventory id (P10). */
  resolvedAdsByInventoryId?: Map<string, ResolvedPublisherAd>
}) {
  const showAdSlots = isProfileAdSlotsEnabled()
  const showPublicListing = isPublisherAdPublicListingEnabled()
  const serving =
    isPublisherSelfManagedAdsEnabled() && isPublisherAdServingEnabled()
  const mediaKitHref = ROUTES.PUBLISHER_REKLAM(publisher.slug)
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <header className="mb-8">
        {publisher.coverImageUrl ? (
          <div className="relative mb-4 h-40 w-full overflow-hidden rounded-2xl sm:h-52">
            <SafeNewsImage src={publisher.coverImageUrl} alt="" fill className="object-cover" />
          </div>
        ) : null}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))]">
            {publisher.logoUrl ? (
              <SafeNewsImage src={publisher.logoUrl} alt={publisher.displayName} fill className="object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-2xl font-black text-[rgb(var(--color-muted))]">
                {publisher.displayName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{publisher.displayName}</h1>
              {publisher.isVerified ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-bold text-emerald-600">
                  <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
                  Doğrulandı
                </span>
              ) : null}
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-sm text-[rgb(var(--color-muted))]">
              {(publisher.city || publisher.countryCode) && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-4 w-4" aria-hidden />
                  {[publisher.city, publisher.district, publisher.countryCode].filter(Boolean).join(', ')}
                </span>
              )}
              {publisher.websiteUrl ? (
                <a href={publisher.websiteUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-[rgb(var(--color-brand))]">
                  <Globe className="h-4 w-4" aria-hidden />
                  Web sitesi
                  <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-[rgb(var(--color-muted))]">
              Takip et: <span className="font-semibold">—</span>
            </p>
            {publisher.description ? (
              <p className="mt-3 text-sm leading-relaxed">{publisher.description}</p>
            ) : null}
          </div>
        </div>
      </header>

      {!layout ? (
        <ChronologicalFallback articles={fallbackArticles} />
      ) : (
        <div data-theme={layout.layout.themeKey} className="space-y-8">
          {layout.sections
            .filter(({ section }) => section.isVisible)
            .map(({ section, items }) => (
              <section key={section.id}>
                <h2 className="mb-4 text-lg font-black">{section.title}</h2>
                <div className="grid grid-cols-12 gap-3">
                  {items.map((item) => {
                    const span = item.span || spanForSize(item.size)

                    if (item.itemType === 'AD_SLOT') {
                      if (!showAdSlots) return null
                      const inventoryId =
                        item.contentId ||
                        (typeof item.presentation?.inventoryId === 'string'
                          ? item.presentation.inventoryId
                          : null)
                      const inv = inventoryId ? adInventoryById?.get(inventoryId) : undefined
                      const resolved =
                        serving && inventoryId
                          ? resolvedAdsByInventoryId?.get(inventoryId)
                          : undefined

                      // Priority: active self-managed creative > sellable placeholder > nothing
                      if (resolved) {
                        return (
                          <div
                            key={item.id}
                            style={{
                              gridColumn: `span ${Math.min(12, span)} / span ${Math.min(12, span)}`,
                            }}
                          >
                            <PublisherAdRenderer
                              ad={{
                                adId: resolved.ad.id,
                                creativeId: resolved.creative.id,
                                creativeType: resolved.creative.creativeType,
                                mediaUrl: resolved.creative.mediaUrl,
                                thumbnailUrl: resolved.creative.thumbnailUrl,
                                headline: resolved.creative.headline,
                                body: resolved.creative.body,
                                altText: resolved.creative.altText,
                                advertiserName: resolved.ad.advertiserName,
                                clickHref: resolved.clickHref,
                              }}
                              label="Reklam"
                            />
                          </div>
                        )
                      }

                      const forSale =
                        showPublicListing &&
                        inv &&
                        inv.isPubliclyListed &&
                        inv.saleStatus === 'AVAILABLE' &&
                        inv.status === 'ACTIVE'
                      if (!forSale) return null
                      return (
                        <div
                          key={item.id}
                          style={{ gridColumn: `span ${Math.min(12, span)} / span ${Math.min(12, span)}` }}
                        >
                          <PublisherAdSlotPlaceholder
                            name={inv?.name}
                            semanticSize={inv?.semanticSize ?? (item.size as string)}
                            saleStatus={inv?.saleStatus}
                            priceMinor={inv?.priceMinor}
                            currency={inv?.currency}
                            mediaKitHref={mediaKitHref}
                          />
                        </div>
                      )
                    }

                    const article = item.article
                    if (!article) return null
                    return (
                      <div
                        key={item.id}
                        style={{ gridColumn: `span ${Math.min(12, span)} / span ${Math.min(12, span)}` }}
                      >
                        <ArticleCard article={article} size={item.size} />
                      </div>
                    )
                  })}
                </div>
              </section>
            ))}
        </div>
      )}
    </div>
  )
}
