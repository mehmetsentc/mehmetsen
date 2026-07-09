import { getSiteNavItems } from '@/constants/config'
import { ROUTES } from '@/constants/routes'
import { getSiteUrl, buildFeedPageJsonLd } from '@/lib/seo'
import type { NewsItem } from '@/types/newsItem'

interface FeedStructuredDataProps {
  headlines: NewsItem[]
}

export function FeedStructuredData({ headlines }: FeedStructuredDataProps) {
  const siteUrl = getSiteUrl()
  const navItems = getSiteNavItems()

  const navigationJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'NaHaber Haber Kategorileri',
    itemListElement: navItems.map((item, index) => ({
      '@type': 'SiteNavigationElement',
      position: index + 1,
      name: item.label,
      url: `${siteUrl}${item.href}`,
    })),
  }

  const sitemapJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'NaHaber Site Haritası',
    url: `${siteUrl}${ROUTES.SITE_MAP}`,
  }

  const pageJsonLd = buildFeedPageJsonLd(headlines, siteUrl)

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pageJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(navigationJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(sitemapJsonLd) }}
      />
    </>
  )
}
