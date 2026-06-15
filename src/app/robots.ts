import type { MetadataRoute } from 'next'
import { getSiteUrl } from '@/lib/seo'

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl()
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin/',
          '/api/',
          '/_next/',
          '/settings/',
          '/settings',
          '/messages/',
          '/messages',
          '/notifications',
          '/login',
          '/register',
          '/onboarding',
          '/post/create',
          '/saved',
          '/search',
        ],
      },
      {
        userAgent: 'Googlebot-News',
        allow: ['/news/', '/kategori/', '/feed'],
        disallow: ['/admin/', '/api/', '/settings', '/login', '/register'],
      },
    ],
    sitemap: [
      `${siteUrl}/sitemap.xml`,
      `${siteUrl}/news-sitemap.xml`,
      `${siteUrl}/video-sitemap.xml`,
      `${siteUrl}/images-sitemap.xml`,
    ],
    host: siteUrl,
  }
}
