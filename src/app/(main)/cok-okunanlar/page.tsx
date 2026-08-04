import type { Metadata } from 'next'
import Link from 'next/link'
import { Flame } from 'lucide-react'
import { ROUTES } from '@/constants/routes'
import { getSiteUrl, buildCategoryOgUrl } from '@/lib/seo'
import { getCategoryLabel } from '@/lib/newsMapper'
import { newsItemDetailHref } from '@/lib/newsItemUtils'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { getMostReadPosts } from '@/services/newsService.server'
import { FEED_FALLBACK_LOGO } from '@/lib/feedMediaUtils'

export const revalidate = 120

export async function generateMetadata(): Promise<Metadata> {
  const siteUrl = getSiteUrl()
  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'
  const title = 'En Çok Okunan Haberler'
  const description = `${siteName} okuyucularının en çok okuduğu haberler — günün en popüler haber başlıkları.`
  const canonical = `${siteUrl}${ROUTES.MOST_READ}`
  const ogImage = buildCategoryOgUrl('En Çok Okunan Haberler', 'Popüler')

  return {
    title,
    description,
    keywords: ['en çok okunan haberler', 'popüler haberler', 'günün haberleri', 'trend haberler', siteName],
    robots: { index: true, follow: true },
    alternates: { canonical },
    openGraph: {
      title: `${title} | ${siteName}`,
      description,
      url: canonical,
      type: 'website',
      locale: 'tr_TR',
      siteName,
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      site: '@nahabercom',
      title: `${title} | ${siteName}`,
      description,
      images: [{ url: ogImage, alt: title }],
    },
  }
}

export default async function MostReadPage() {
  const items = await getMostReadPosts(40)
  const siteUrl = getSiteUrl()
  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `En Çok Okunan Haberler | ${siteName}`,
    description: `${siteName} okuyucularının en çok okuduğu haberler.`,
    url: `${siteUrl}${ROUTES.MOST_READ}`,
    inLanguage: 'tr-TR',
    isPartOf: { '@type': 'WebSite', name: siteName, url: siteUrl },
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: siteName, item: siteUrl },
        { '@type': 'ListItem', position: 2, name: 'Haberler', item: `${siteUrl}${ROUTES.FEED}` },
        { '@type': 'ListItem', position: 3, name: 'En Çok Okunanlar', item: `${siteUrl}${ROUTES.MOST_READ}` },
      ],
    },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: items.slice(0, 20).map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: `${siteUrl}${newsItemDetailHref(item)}`,
        name: item.title,
      })),
    },
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        <header className="mb-8 border-b border-[rgb(var(--color-border))] pb-6">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-[rgb(var(--color-brand))]">
            <Flame className="h-4 w-4" aria-hidden />
            Popüler
          </p>
          <h1 className="text-3xl font-black tracking-tight text-[rgb(var(--color-text))]">
            En Çok Okunanlar
          </h1>
          <p className="mt-2 text-sm text-[rgb(var(--color-muted))]">
            Okuyucuların en çok ilgi gösterdiği haberler.
          </p>
        </header>

        {items.length === 0 ? (
          <p className="py-10 text-center text-sm text-[rgb(var(--color-muted))]">
            Henüz yeterli okuma verisi yok.
          </p>
        ) : (
          <ol className="space-y-4">
            {items.map((item, index) => {
              const image = item.imageUrl || FEED_FALLBACK_LOGO
              return (
                <li key={item.id}>
                  <Link
                    href={newsItemDetailHref(item)}
                    className="flex gap-3 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-3 transition-colors hover:border-[rgb(var(--color-brand))]/40"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--color-brand))] text-sm font-black text-white">
                      {index + 1}
                    </span>
                    <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-lg bg-[rgb(var(--color-border))]">
                      <SafeNewsImage
                        src={image}
                        alt={item.title}
                        fill
                        className="object-cover"
                        sizes="112px"
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-[rgb(var(--color-brand))]">
                        {getCategoryLabel(item.category)}
                      </p>
                      <h2 className="mt-0.5 line-clamp-2 text-sm font-bold text-[rgb(var(--color-text))]">
                        {item.title}
                      </h2>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ol>
        )}
      </main>
    </>
  )
}
