import type { NextConfig } from 'next'
import path from 'node:path'
import { NEWS_IMAGE_REMOTE_PATTERNS } from './src/constants/imageHosts'

const nextConfig: NextConfig = {
  compress: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,

  // F2.5 — react-hot-toast'u kendi sonner-shim'imize yönlendir.
  // Tüm legacy `import toast from 'react-hot-toast'` çağrıları artık NaHaber
  // design-token'lı sonner UI'sından beslenir. Dosyalara dokunulmadı.
  webpack: (config) => {
    config.resolve = config.resolve || {}
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      'react-hot-toast': path.resolve(__dirname, 'src/lib/toast-shim.ts'),
    }
    return config
  },
  turbopack: {
    resolveAlias: {
      'react-hot-toast': './src/lib/toast-shim.ts',
    },
  },

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
      { source: '/news/:slug', destination: '/haber/:slug', permanent: true },
      { source: '/local', destination: '/yerel', permanent: true },
      { source: '/local/:path*', destination: '/yerel/:path*', permanent: true },
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
          // HSTS — 2 years + subdomains + preload-list eligible. Once this is
          // in production for ~30 days you can submit nahaber.com to
          // https://hstspreload.org so all browsers ship the upgrade.
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          // Lock down browser feature surfaces we don't use — defence in depth
          // against a future XSS being able to pop up camera/mic/payment APIs.
          {
            key: 'Permissions-Policy',
            value: [
              'accelerometer=()',
              'autoplay=(self)',
              'camera=()',
              'clipboard-read=(self)',
              'clipboard-write=(self)',
              'display-capture=()',
              'document-domain=()',
              'encrypted-media=(self)',
              'fullscreen=(self)',
              'gamepad=()',
              'geolocation=(self)',
              'gyroscope=()',
              'hid=()',
              'idle-detection=()',
              'magnetometer=()',
              'microphone=()',
              'midi=()',
              'payment=()',
              'picture-in-picture=(self)',
              'publickey-credentials-get=(self)',
              'screen-wake-lock=(self)',
              'serial=()',
              'sync-xhr=()',
              'usb=()',
              'web-share=(self)',
              'xr-spatial-tracking=()',
            ].join(', '),
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com https://va.vercel-scripts.com https://apis.google.com https://www.gstatic.com https://accounts.google.com https://www.google.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              "connect-src 'self' https://*.googleapis.com https://oauth2.googleapis.com https://www.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://firebasestorage.googleapis.com https://www.google-analytics.com https://vitals.vercel-insights.com https://nahaberapp.firebaseapp.com https://api.open-meteo.com https://air-quality-api.open-meteo.com",
              "frame-src 'self' https://accounts.google.com https://www.google.com https://*.google.com https://*.firebaseapp.com https://nahaberapp.firebaseapp.com https://www.youtube.com https://www.youtube-nocookie.com",
              "frame-ancestors 'self'",
              "base-uri 'self'",
              "form-action 'self' https://accounts.google.com",
            ].join('; '),
          },
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
