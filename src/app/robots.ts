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
        allow: ['/haber/', '/kategori/', '/feed'],
        disallow: ['/admin/', '/api/', '/settings', '/login', '/register'],
      },
      {
        userAgent: 'Googlebot-Image',
        allow: ['/haber/', '/kategori/', '/feed', '/images-sitemap.xml'],
        disallow: ['/admin/', '/api/'],
      },
      {
        userAgent: 'Googlebot-Video',
        allow: ['/haber/', '/reels', '/video-sitemap.xml'],
        disallow: ['/admin/', '/api/'],
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
