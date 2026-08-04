import { getSiteUrl, buildCategoryOgUrl } from '@/lib/seo'
import { ROUTES } from '@/constants/routes'
import { DEFAULT_CATEGORIES, type CategoryDef } from '@/constants/config'
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
  const pageTitle = `${cat.name} Haberleri`

  const parentCat = cat.parentId
    ? DEFAULT_CATEGORIES.find((c) => c.id === cat.parentId) ?? null
    : null

  const breadcrumbItems: Array<{ '@type': 'ListItem'; position: number; name: string; item: string }> = [
    { '@type': 'ListItem', position: 1, name: siteName, item: siteUrl },
    { '@type': 'ListItem', position: 2, name: 'Haberler', item: `${siteUrl}${ROUTES.FEED}` },
  ]

  if (parentCat) {
    breadcrumbItems.push({
      '@type': 'ListItem',
      position: 3,
      name: parentCat.name,
      item: `${siteUrl}${ROUTES.CATEGORY(parentCat.slug ?? parentCat.id)}`,
    })
    breadcrumbItems.push({
      '@type': 'ListItem',
      position: 4,
      name: cat.name,
      item: pageUrl,
    })
  } else {
    breadcrumbItems.push({
      '@type': 'ListItem',
      position: 3,
      name: cat.name,
      item: pageUrl,
    })
  }

  const ogImage = buildCategoryOgUrl(pageTitle, cat.name)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${pageTitle} | ${siteName}`,
    description: `${cat.name} kategorisindeki son dakika haberler ve güncel gelişmeler.`,
    url: pageUrl,
    inLanguage: 'tr-TR',
    isPartOf: { '@type': 'WebSite', name: siteName, url: siteUrl },
    image: {
      '@type': 'ImageObject',
      url: ogImage,
      width: 1200,
      height: 630,
    },
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: breadcrumbItems,
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
    publisher: {
      '@type': 'NewsMediaOrganization',
      name: siteName,
      url: siteUrl,
      logo: {
        '@type': 'ImageObject',
        url: `${siteUrl}/brand/nahaber-logo.png`,
        width: 512,
        height: 512,
      },
    },
  }

  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
  )
}
