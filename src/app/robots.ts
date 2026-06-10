import type { MetadataRoute } from 'next'

const siteUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || 'https://nahaber.com'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin/',
          '/api/',
          '/_next/',
          '/ayarlar',
          '/mesajlar',
          '/bildirimler',
        ],
      },
      {
        userAgent: 'Googlebot-News',
        allow: ['/news/', '/kategori/', '/feed'],
        disallow: ['/admin/', '/api/', '/ayarlar'],
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
