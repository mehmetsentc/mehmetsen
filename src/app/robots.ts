import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { getSiteUrl } from '@/lib/seo'
import { getCitySlugFromHost } from '@/lib/cityHost'

/**
 * robots.txt — host-aware.
 * - City subdomains (canakkale.nahaber.com) → city sitemap URL'leri
 * - National (www.nahaber.com) → ulusal sitemap seti
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const headerStore = await headers()
  const host = headerStore.get('x-forwarded-host') ?? headerStore.get('host') ?? ''
  const citySlug = getCitySlugFromHost(host)

  const siteUrl = citySlug
    ? `https://${citySlug}.nahaber.com`
    : getSiteUrl()

  // Host directive: domain only (no https:// prefix) — Yandex extension, Google ignores it
  const hostDomain = citySlug
    ? `${citySlug}.nahaber.com`
    : siteUrl.replace(/^https?:\/\//, '')

  const commonDisallow = [
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
  ]

  const AI_BOTS = [
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
  ]

  if (citySlug) {
    // ── City subdomain ──────────────────────────────────────────────────────
    return {
      rules: [
        {
          userAgent: '*',
          allow: '/',
          disallow: commonDisallow,
        },
        {
          userAgent: 'Googlebot-News',
          allow: ['/haber/', '/kategori/', '/etkinlik', '/spor'],
          disallow: ['/admin/', '/api/'],
        },
        {
          userAgent: 'Googlebot-Image',
          allow: ['/haber/', '/kategori/'],
          disallow: ['/admin/', '/api/'],
        },
        {
          userAgent: AI_BOTS,
          disallow: '/',
        },
      ],
      sitemap: [
        `${siteUrl}/sitemap.xml`,
        `${siteUrl}/news-sitemap.xml`,
      ],
      host: hostDomain,
    }
  }

  // ── National site ─────────────────────────────────────────────────────────
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: commonDisallow,
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
      {
        userAgent: AI_BOTS,
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
