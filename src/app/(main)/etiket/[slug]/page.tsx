import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Hash } from 'lucide-react'
import { ROUTES } from '@/constants/routes'
import { getSiteUrl } from '@/lib/seo'
import { formatTagLabel } from '@/lib/tags'
import { getPostsByTag } from '@/services/newsService.server'
import { getCategoryLabel } from '@/lib/newsMapper'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'

export const revalidate = 300

interface Props {
  params: Promise<{ slug: string }>
}

function decodeTagSlug(raw: string): string {
  try {
    return decodeURIComponent(raw).trim().toLocaleLowerCase('tr-TR')
  } catch {
    return raw.trim().toLocaleLowerCase('tr-TR')
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tag = decodeTagSlug((await params).slug)
  if (!tag) return { title: 'Etiket bulunamadı', robots: { index: false, follow: false } }

  const siteUrl = getSiteUrl()
  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'
  const label = formatTagLabel(tag)
  const title = `${label} Haberleri`
  const description = `${label} etiketiyle yayınlanan son haberler, güncel gelişmeler ve arşiv — ${siteName}.`
  const canonical = `${siteUrl}${ROUTES.TAG(tag)}`

  return {
    title,
    description,
    robots: { index: true, follow: true },
    alternates: { canonical },
    openGraph: {
      title: `${title} | ${siteName}`,
      description,
      url: canonical,
      type: 'website',
      locale: 'tr_TR',
      siteName,
    },
    twitter: {
      card: 'summary',
      site: '@nahabercom',
      title,
      description,
    },
  }
}

export default async function TagPage({ params }: Props) {
  const tag = decodeTagSlug((await params).slug)
  if (!tag || !/^[\p{L}\p{N}_-]+$/u.test(tag)) notFound()

  const posts = await getPostsByTag(tag, 40)
  if (posts.length === 0) notFound()

  const siteUrl = getSiteUrl()
  const label = formatTagLabel(tag)
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${label} Haberleri`,
    url: `${siteUrl}${ROUTES.TAG(tag)}`,
    inLanguage: 'tr-TR',
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
      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        <header className="mb-8 border-b border-[rgb(var(--color-border))] pb-6">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-[rgb(var(--color-brand))]">
            <Hash className="h-4 w-4" />
            Etiket
          </p>
          <h1 className="text-3xl font-black tracking-tight text-[rgb(var(--color-text))]">
            {label} Haberleri
          </h1>
          <p className="mt-2 text-sm text-[rgb(var(--color-muted))]">
            {posts.length} haber listeleniyor
          </p>
        </header>

        <div className="divide-y divide-[rgb(var(--color-border))]">
          {posts.map((post) => (
            <article key={post.id} className="flex gap-4 py-4">
              <Link
                href={ROUTES.NEWS_DETAIL(post.slug)}
                className="relative h-20 w-28 shrink-0 overflow-hidden rounded-lg bg-[rgb(var(--color-surface))]"
              >
                {post.coverImageUrl ? (
                  <SafeNewsImage
                    src={post.coverImageUrl}
                    alt={post.title}
                    fill
                    className="object-cover"
                    sizes="112px"
                  />
                ) : null}
              </Link>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--color-brand))]">
                  {getCategoryLabel(post.categoryId)}
                </p>
                <h2 className="mt-1 text-base font-bold leading-snug text-[rgb(var(--color-text))]">
                  <Link href={ROUTES.NEWS_DETAIL(post.slug)} className="hover:underline">
                    {post.title}
                  </Link>
                </h2>
                {post.summary ? (
                  <p className="mt-1 line-clamp-2 text-sm text-[rgb(var(--color-muted))]">
                    {post.summary}
                  </p>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </main>
    </>
  )
}
