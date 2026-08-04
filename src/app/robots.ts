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
          '/offline',
          '/dev/',
        ],
      },
      {
        userAgent: 'Googlebot-News',
        allow: ['/haber/', '/kategori/', '/yerel/', '/feed', '/etiket/', '/cok-okunanlar'],
        disallow: ['/admin/', '/api/', '/settings', '/login', '/register'],
      },
      {
        userAgent: 'Googlebot-Image',
        allow: ['/haber/', '/kategori/', '/yerel/', '/feed', '/images-sitemap.xml'],
        disallow: ['/admin/', '/api/'],
      },
      {
        userAgent: 'Googlebot-Video',
        allow: ['/haber/', '/reels', '/video-sitemap.xml'],
        disallow: ['/admin/', '/api/'],
      },
      // Block AI training crawlers — they pull every URL, every day, and add no
      // referral traffic. Each crawl translates directly into Firestore reads
      // for SSR'd article pages, which is exactly what we're trying to cap.
      {
        userAgent: [
          'GPTBot',
          'ChatGPT-User',
          'OAI-SearchBot',
          'CCBot',
          'anthropic-ai',
          'ClaudeBot',
          'Claude-Web',
          'Google-Extended',
          'PerplexityBot',
          'Bytespider',
          'Amazonbot',
          'cohere-ai',
          'Diffbot',
          'ImagesiftBot',
        ],
        disallow: '/',
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
