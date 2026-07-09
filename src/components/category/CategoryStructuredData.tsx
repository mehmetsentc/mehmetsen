import { getSiteUrl } from '@/lib/seo'
import { ROUTES } from '@/constants/routes'
import type { CategoryDef } from '@/constants/config'
import type { TimelinePost } from '@/types/post'
import { categoryPostHref } from '@/components/home/desktop/categoryPostUtils'

interface CategoryStructuredDataProps {
  cat: CategoryDef
  posts: TimelinePost[]
}

export function CategoryStructuredData({ cat, posts }: CategoryStructuredDataProps) {
  const siteUrl = getSiteUrl()
  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'
  const pageUrl = `${siteUrl}${ROUTES.CATEGORY(cat.slug ?? cat.id)}`

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${cat.name} Haberleri | ${siteName}`,
    description: `${cat.name} kategorisindeki son dakika haberler ve güncel gelişmeler.`,
    url: pageUrl,
    inLanguage: 'tr-TR',
    isPartOf: { '@type': 'WebSite', name: siteName, url: siteUrl },
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: siteName, item: siteUrl },
        { '@type': 'ListItem', position: 2, name: 'Haberler', item: `${siteUrl}${ROUTES.FEED}` },
        { '@type': 'ListItem', position: 3, name: cat.name, item: pageUrl },
      ],
    },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: posts.slice(0, 12).map((post, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: `${siteUrl}${categoryPostHref(post)}`,
        name: post.title,
      })),
    },
  }

  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
  )
}
