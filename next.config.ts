import type { NextConfig } from 'next'
import { NEWS_IMAGE_REMOTE_PATTERNS } from './src/constants/imageHosts'

const nextConfig: NextConfig = {
  compress: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,

  images: {
    // Cache optimized images for 7 days
    minimumCacheTTL: 60 * 60 * 24 * 7,
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
    remotePatterns: [
      { protocol: 'https', hostname: 'firebasestorage.googleapis.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'www.biletix.com' },
      { protocol: 'https', hostname: 'cdn.bubilet.com.tr' },
      ...NEWS_IMAGE_REMOTE_PATTERNS,
    ],
  },

  async redirects() {
    return [
      { source: '/haber/:slug', destination: '/news/:slug', permanent: true },
      { source: '/ayarlar', destination: '/settings', permanent: true },
      { source: '/ayarlar/:path*', destination: '/settings/:path*', permanent: true },
      { source: '/mesajlar', destination: '/messages', permanent: true },
      { source: '/mesajlar/:path*', destination: '/messages/:path*', permanent: true },
      { source: '/bildirimler', destination: '/notifications', permanent: true },
    ]
  },

  // HTTP caching headers — Vercel CDN caches these globally (Pro)
  async headers() {
    return [
      // Static assets: 1 year immutable
      {
        source: '/_next/static/(.*)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      // Finance rates: 60s CDN cache + stale-while-revalidate
      {
        source: '/api/finance/rates',
        headers: [{ key: 'Cache-Control', value: 's-maxage=60, stale-while-revalidate=120' }],
      },
      // Weather: 10 min CDN cache
      {
        source: '/api/weather',
        headers: [{ key: 'Cache-Control', value: 's-maxage=600, stale-while-revalidate=300' }],
      },
      // Top news: 2 min CDN cache
      {
        source: '/api/news/top',
        headers: [{ key: 'Cache-Control', value: 's-maxage=120, stale-while-revalidate=60' }],
      },
      // OG images: 24h CDN cache
      {
        source: '/api/og/(.*)',
        headers: [{ key: 'Cache-Control', value: 's-maxage=86400, stale-while-revalidate=3600' }],
      },
      // RSS feeds: 5 min CDN cache
      {
        source: '/rss/(.*)',
        headers: [{ key: 'Cache-Control', value: 's-maxage=300, stale-while-revalidate=60' }],
      },
      // Sitemaps: 1 hour CDN cache
      {
        source: '/sitemap(.*).xml',
        headers: [{ key: 'Cache-Control', value: 's-maxage=3600, stale-while-revalidate=600' }],
      },
      // Brand assets & PWA icons: 1 year immutable (Vercel CDN)
      {
        source: '/brand/(.*)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/(.*\\.(?:png|jpg|jpeg|webp|avif|ico|svg|woff2))',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      // Sports scores: 2 min CDN cache
      {
        source: '/api/sports/matches',
        headers: [{ key: 'Cache-Control', value: 's-maxage=120, stale-while-revalidate=60' }],
      },
      // Security headers
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ]
  },

  experimental: {
    optimizePackageImports: [
      'lucide-react',
      'date-fns',
      '@firebase/firestore',
      '@vercel/analytics',
      '@vercel/speed-insights',
    ],
    // Client-side router cache — fewer full re-fetches on navigation (Next.js 15)
    staleTimes: {
      dynamic: 60,
      static: 600,
    },
  },
}

export default nextConfig
