import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ROUTES } from '@/constants/routes'
import { getSiteUrl, buildCategoryOgUrl } from '@/lib/seo'
import { formatTagLabel, isValidTagSlug, parseTagSlug } from '@/lib/tags'
import { getPostsByTag } from '@/services/newsService.server'
import { getCategoryLabel } from '@/lib/newsMapper'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'

export const revalidate = 300

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tag = parseTagSlug((await params).slug)
  if (!tag) return { title: 'Etiket bulunamadı', robots: { index: false, follow: false } }

  const siteUrl = getSiteUrl()
  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'
  const label = formatTagLabel(tag)
  const title = `${label} Haberleri`
  const description = `${label} etiketiyle yayınlanan son haberler, güncel gelişmeler ve arşiv — ${siteName}.`
  const canonical = `${siteUrl}${ROUTES.TAG(tag)}`

  const ogImage = buildCategoryOgUrl(title, 'Etiket')
  return {
    title,
    description,
    keywords: [label, `${label} haberleri`, `${label} son dakika`, siteName],
    robots: { index: false, follow: true },
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

export default async function TagPage({ params }: Props) {
  const tag = parseTagSlug((await params).slug)
  if (!isValidTagSlug(tag)) notFound()

  const posts = await getPostsByTag(tag, 40)
  if (posts.length === 0) notFound()

  const siteUrl = getSiteUrl()
  const label = formatTagLabel(tag)
  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'
  const tagUrl = `${siteUrl}${ROUTES.TAG(tag)}`
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${label} Haberleri | ${siteName}`,
    description: `${label} etiketiyle yayınlanan son haberler ve güncel gelişmeler.`,
    url: tagUrl,
    inLanguage: 'tr-TR',
    isPartOf: { '@type': 'WebSite', name: siteName, url: siteUrl },
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: siteName, item: siteUrl },
        { '@type': 'ListItem', position: 2, name: 'Haberler', item: `${siteUrl}${ROUTES.FEED}` },
        { '@type': 'ListItem', position: 3, name: label, item: tagUrl },
      ],
    },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: posts.slice(0, 20).map((post, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: `${siteUrl}${ROUTES.NEWS_DETAIL(post.slug)}`,
        name: post.title,
      })),
    },
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div
        className="desktop-newspaper-shell bbc-category-page w-full pb-10"
        style={{ ['--cat-accent' as string]: 'var(--brand-500)' }}
      >
        <header className="bbc-category-header bbc-category-header--accent mb-8">
          <p className="bbc-category-kicker">Konu Dosyası</p>
          <h1 className="bbc-category-title">#{label} Haberleri</h1>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[rgb(var(--color-muted))] sm:text-base">
            {label} konusunda yayımlanan son gelişmeler, arşiv ve ilgili haberler.
            Bu sayfada {posts.length} haber listeleniyor.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href={ROUTES.MOST_READ} className="bbc-category-chip">
              En çok okunanlar
            </Link>
            <Link href={ROUTES.FEED} className="bbc-category-chip">
              Ana sayfa
            </Link>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-x-8 gap-y-8 sm:grid-cols-2 xl:grid-cols-3">
          {posts.map((post) => (
            <article key={post.id} className="group min-w-0">
              <Link
                href={ROUTES.NEWS_DETAIL(post.slug)}
                className="relative mb-3 block aspect-[16/10] overflow-hidden rounded-xl bg-[rgb(var(--color-surface))]"
              >
                {post.coverImageUrl ? (
                  <SafeNewsImage
                    src={post.coverImageUrl}
                    alt={post.title}
                    fill
                    className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    sizes="(min-width: 1280px) 360px, (min-width: 640px) 45vw, 100vw"
                  />
                ) : null}
              </Link>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-[rgb(var(--color-brand))]">
                {getCategoryLabel(post.categoryId)}
              </p>
              <h2 className="bbc-story-title bbc-story-title--md mt-1">
                <Link href={ROUTES.NEWS_DETAIL(post.slug)} className="hover:underline">
                  {post.title}
                </Link>
              </h2>
              {post.summary ? (
                <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-[rgb(var(--color-muted))]">
                  {post.summary}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      </div>
    </>
  )
}
