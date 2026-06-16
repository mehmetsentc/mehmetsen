import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { getSiteUrl } from '@/lib/seo'
import { ROUTES } from '@/constants/routes'
import type { Post } from '@/types/post'

const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'

type PageProps = { params: Promise<{ slug: string }> }

async function getAuthorArticles(source: string): Promise<Post[]> {
  const snap = await getAdminFirestore()
    .collection(Collections.NEWS)
    .where('status', '==', 'published')
    .where('source', '==', source)
    .orderBy('publishedAt', 'desc')
    .limit(30)
    .get()
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Post))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const source = decodeURIComponent(slug).replace(/-/g, ' ')
  const siteUrl = getSiteUrl()

  return {
    title: `${source} Haberleri | ${siteName}`,
    description: `${source} kaynağından en son haberler — ${siteName}.`,
    alternates: { canonical: `${siteUrl}/yazar/${slug}` },
    openGraph: {
      title: `${source} | ${siteName}`,
      description: `${source} kaynağından haberler`,
      url: `${siteUrl}/yazar/${slug}`,
      type: 'profile',
    },
    twitter: {
      card: 'summary',
      title: `${source} Haberleri | ${siteName}`,
      description: `${source} kaynağından en son haberler`,
    },
  }
}

export default async function YazarPage({ params }: PageProps) {
  const { slug } = await params
  const source = decodeURIComponent(slug).replace(/-/g, ' ')
  const siteUrl = getSiteUrl()

  let articles: Post[] = []
  try {
    articles = await getAuthorArticles(source)
  } catch (err) {
    console.error('[yazar] fetch error:', err)
  }

  if (articles.length === 0) {
    notFound()
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    name: `${source} — ${siteName}`,
    url: `${siteUrl}/yazar/${slug}`,
    mainEntity: {
      '@type': 'Person',
      name: source,
      url: `${siteUrl}/yazar/${slug}`,
      worksFor: {
        '@type': 'NewsMediaOrganization',
        name: siteName,
        url: siteUrl,
      },
    },
  }
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Ana Sayfa', item: `${siteUrl}${ROUTES.FEED}` },
      { '@type': 'ListItem', position: 2, name: 'Yazarlar', item: `${siteUrl}/yazar/${slug}` },
      { '@type': 'ListItem', position: 3, name: source, item: `${siteUrl}/yazar/${slug}` },
    ],
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <main className="mx-auto max-w-4xl px-4 py-10">
        {/* Author header */}
        <div className="mb-8 flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[rgb(var(--color-brand))]/20 text-2xl font-bold text-[rgb(var(--color-brand))]">
            {source.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-bold">{source}</h1>
            <p className="text-sm text-[rgb(var(--color-muted))]">
              {articles.length} haber
            </p>
          </div>
        </div>

        {/* Breadcrumb */}
        <nav className="mb-6 flex items-center gap-2 text-xs text-[rgb(var(--color-muted))]">
          <a href={ROUTES.FEED} className="hover:text-white">Ana Sayfa</a>
          <span>/</span>
          <span>{source}</span>
        </nav>

        {/* Articles list */}
        <div className="flex flex-col gap-4">
          {articles.map((post) => {
            const slug = post.slug?.trim() || post.id
            const path = slug !== post.id ? ROUTES.NEWS_DETAIL(slug) : ROUTES.POST_DETAIL(post.id)
            const pubDate = post.publishedAt
              ? new Date(post.publishedAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
              : ''
            return (
              <a
                key={post.id}
                href={path}
                className="flex items-start gap-4 rounded-xl border border-white/10 bg-white/5 p-4 transition-colors hover:bg-white/10"
              >
                {post.coverImageUrl && (
                  <img
                    src={post.coverImageUrl}
                    alt={post.title}
                    className="h-20 w-32 shrink-0 rounded-lg object-cover"
                    loading="lazy"
                  />
                )}
                <div className="flex flex-col gap-1">
                  <h2 className="line-clamp-2 text-sm font-semibold leading-snug text-white">
                    {post.title}
                  </h2>
                  {pubDate && (
                    <p className="text-xs text-[rgb(var(--color-muted))]">{pubDate}</p>
                  )}
                </div>
              </a>
            )
          })}
        </div>
      </main>
    </>
  )
}
