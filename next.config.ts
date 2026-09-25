import type { NextConfig } from 'next'
import path from 'node:path'
import { NEWS_IMAGE_REMOTE_PATTERNS } from './src/constants/imageHosts'

/**
 * SEO-1A-X.1 — serve blocking metadata (canonical, robots, title, OG…) in
 * `<head>` to Googlebot.
 *
 * Next.js 15.2+ streams `generateMetadata` output into `<body>` for every user
 * agent that is not an "HTML-limited bot". Googlebot is not on Next's default
 * list, but Google only accepts `rel="canonical"` (and hreflang) inside
 * `<head>` (developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls).
 *
 * `htmlLimitedBots` REPLACES Next's default list, so this is the verbatim
 * Next.js 15.5.19 default (next/dist/shared/lib/router/utils/html-bots.js)
 * plus `Googlebot(?!-)`: the real Googlebot Smartphone/Desktop crawler
 * ("Googlebot/2.1"), not Googlebot-Image/-Video/-News tokens. Next applies
 * the pattern case-insensitively. Normal browsers keep streaming metadata.
 *
 * src/lib/seo/htmlLimitedBots.seo1ax.test.ts fails if a Next upgrade changes
 * the default list, so it cannot silently drift.
 */
const HTML_LIMITED_BOTS =
  /[\w-]+-Google|Google-[\w-]+|Chrome-Lighthouse|Slurp|DuckDuckBot|baiduspider|yandex|sogou|bitlybot|tumblr|vkShare|quora link preview|redditbot|ia_archiver|Bingbot|BingPreview|applebot|facebookexternalhit|facebookcatalog|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview|Yeti|googleweblight|Googlebot(?!-)/

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.resolve(__dirname),
  htmlLimitedBots: HTML_LIMITED_BOTS,
  compress: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,

  // Client-visible deploy stamp for soft-prompt / update detection.
  env: {
    NEXT_PUBLIC_APP_VERSION:
      process.env.NEXT_PUBLIC_APP_VERSION ||
      process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ||
      process.env.npm_package_version ||
      '0.1.0',
  },

  // F2.5 — react-hot-toast'u kendi sonner-shim'imize yönlendir.
  // Tüm legacy `import toast from 'react-hot-toast'` çağrıları artık NaHaber
  // design-token'lı sonner UI'sından beslenir. Dosyalara dokunulmadı.
  webpack: (config) => {
    config.resolve = config.resolve || {}
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      'react-hot-toast': path.resolve(__dirname, 'src/lib/toast-shim.ts'),
    }
    config.watchOptions = {
      ...config.watchOptions,
      ignored: [
        '**/.git/**',
        '**/node_modules/**',
        '**/.worktrees/**',
        '**/.tmp/**',
        '**/Claude outputs/**',
        '**/Nahaber_Feed 2/**',
        '**/_to_delete/**',
      ],
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
      { protocol: 'https', hostname: 'storage.googleapis.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'www.biletix.com' },
      { protocol: 'https', hostname: 'cdn.bubilet.com.tr' },
      { protocol: 'https', hostname: 'www.paribucineverse.com' },
      ...NEWS_IMAGE_REMOTE_PATTERNS,
    ],
  },

  async redirects() {
    return [
      { source: '/news/:slug', destination: '/haber/:slug', permanent: true },
      { source: '/local', destination: '/yerel', permanent: true },
      { source: '/local/:path*', destination: '/yerel/:path*', permanent: true },
      { source: '/feed', destination: '/', permanent: true },
      { source: '/search', destination: '/ara', permanent: true },
      { source: '/search/:path*', destination: '/ara/:path*', permanent: true },
      { source: '/settings/privacy-policy', destination: '/ayarlar/gizlilik-politikasi', permanent: true },
      { source: '/settings/account/delete', destination: '/ayarlar/hesap/sil', permanent: true },
      { source: '/settings/privacy', destination: '/ayarlar/gizlilik', permanent: true },
      { source: '/settings/notifications', destination: '/ayarlar/bildirimler', permanent: true },
      { source: '/settings/appearance', destination: '/ayarlar/gorunum', permanent: true },
      { source: '/settings/help', destination: '/ayarlar/yardim', permanent: true },
      { source: '/settings/about', destination: '/ayarlar/hakkinda', permanent: true },
      { source: '/settings/terms', destination: '/ayarlar/kosullar', permanent: true },
      { source: '/settings/profile', destination: '/ayarlar/profil', permanent: true },
      { source: '/settings', destination: '/ayarlar', permanent: true },
      { source: '/messages/:path*', destination: '/mesajlar/:path*', permanent: true },
      { source: '/messages', destination: '/mesajlar', permanent: true },
      { source: '/notifications', destination: '/bildirimler', permanent: true },
      { source: '/weather', destination: '/hava-durumu', permanent: true },
      { source: '/events', destination: '/etkinlikler', permanent: true },
      { source: '/discover', destination: '/kesfet', permanent: true },
      { source: '/login', destination: '/giris', permanent: true },
      { source: '/register', destination: '/kayit', permanent: true },
      { source: '/saved', destination: '/kaydedilenler', permanent: true },
      { source: '/influencer', destination: '/fenomenler', permanent: true },
      { source: '/profile/:username', destination: '/profil/:username', permanent: true },
      { source: '/hukuk/gizlilik', destination: '/gizlilik', permanent: true },
      { source: '/kune', destination: '/kunye', permanent: true },
      { source: '/kategori/otomotiv', destination: '/kategori/otomobil', permanent: true },
      { source: '/kategori/etkinlikler', destination: '/etkinlikler', permanent: true },
      { source: '/konu/:slug', destination: '/etiket/:slug', permanent: true },
      { source: '/sitemap-news-:n.xml', destination: '/sitemap/:n.xml', permanent: false },
      { source: '/burclar', destination: '/kategori/astroloji', permanent: true },
    ]
  },

  async rewrites() {
    return [
      { source: '/ara', destination: '/search' },
      { source: '/ara/:path*', destination: '/search/:path*' },
      { source: '/ayarlar/gizlilik-politikasi', destination: '/settings/privacy-policy' },
      { source: '/ayarlar/hesap/sil', destination: '/settings/account/delete' },
      { source: '/ayarlar/gizlilik', destination: '/settings/privacy' },
      { source: '/ayarlar/bildirimler', destination: '/settings/notifications' },
      { source: '/ayarlar/gorunum', destination: '/settings/appearance' },
      { source: '/ayarlar/yardim', destination: '/settings/help' },
      { source: '/ayarlar/hakkinda', destination: '/settings/about' },
      { source: '/ayarlar/kosullar', destination: '/settings/terms' },
      { source: '/ayarlar/profil', destination: '/settings/profile' },
      { source: '/ayarlar', destination: '/settings' },
      { source: '/mesajlar/:path*', destination: '/messages/:path*' },
      { source: '/mesajlar', destination: '/messages' },
      { source: '/bildirimler', destination: '/notifications' },
      { source: '/hava-durumu', destination: '/weather' },
      { source: '/etkinlikler', destination: '/events' },
      { source: '/kesfet', destination: '/discover' },
      { source: '/giris', destination: '/login' },
      { source: '/kayit', destination: '/register' },
      { source: '/kaydedilenler', destination: '/saved' },
      { source: '/fenomenler', destination: '/influencer' },
      { source: '/profil/:username', destination: '/profile/:username' },
    ]
  },

  // HTTP caching headers — Vercel CDN caches these globally (Pro)
  async headers() {
    return [
      // Production hashed assets: 1 year immutable. Dev chunks reuse
      // /_next/static/chunks/app/page.js — caching them freezes old UI.
      ...(process.env.NODE_ENV === 'production'
        ? [
            {
              source: '/_next/static/(.*)',
              headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
            },
          ]
        : []),
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
      // Home feed pagination + lazy category rails
      {
        source: '/api/feed/more',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, s-maxage=120, stale-while-revalidate=300',
          },
        ],
      },
      {
        source: '/api/feed/category-rails',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, s-maxage=120, stale-while-revalidate=300',
          },
        ],
      },
      // City news: 2 min CDN cache
      {
        source: '/api/city/news',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, s-maxage=120, stale-while-revalidate=300',
          },
        ],
      },
      // OG images: 24h CDN cache
      {
        source: '/api/og/(.*)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400' }],
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
      {
        source: '/api/img',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000',
          },
        ],
      },
      {
        source: '/haber/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, s-maxage=60, stale-while-revalidate=120, must-revalidate',
          },
        ],
      },
      // Service worker: always revalidate so clients pick up SW updates quickly
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        ],
      },
      // HTML document shell: short CDN TTL so Capacitor remote WebView
      // (server.url → https://www.nahaber.com) picks up UI after deploy.
      // Hashed /_next/static assets remain immutable (above).
      {
        source: '/feed',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, s-maxage=60, stale-while-revalidate=120, must-revalidate',
          },
        ],
      },
      {
        source: '/',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, s-maxage=60, stale-while-revalidate=120, must-revalidate',
          },
        ],
      },
      {
        source: '/manifest.webmanifest',
        headers: [
          { key: 'Content-Type', value: 'application/manifest+json; charset=utf-8' },
          { key: 'Cache-Control', value: 'public, max-age=3600' },
        ],
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
              // YouTube reels embeds need cross-origin autoplay + EME (encrypted-media).
              'autoplay=(self "https://www.youtube.com" "https://www.youtube-nocookie.com" "https://player.vimeo.com" "https://www.dailymotion.com")',
              'camera=()',
              'clipboard-read=(self)',
              'clipboard-write=(self)',
              'display-capture=()',
              'document-domain=()',
              'encrypted-media=(self "https://www.youtube.com" "https://www.youtube-nocookie.com" "https://player.vimeo.com" "https://www.dailymotion.com")',
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
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com https://va.vercel-scripts.com https://apis.google.com https://www.gstatic.com https://accounts.google.com https://www.google.com https://cdn.onesignal.com https://s3.tradingview.com https://charting-library.tradingview-widget.com https://static.tradingview.com https://pagead2.googlesyndication.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "media-src 'self' blob: https:",
              "font-src 'self' data:",
              "connect-src 'self' https://*.googleapis.com https://oauth2.googleapis.com https://www.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://firebasestorage.googleapis.com https://www.google-analytics.com https://vitals.vercel-insights.com https://nahaberapp.firebaseapp.com https://api.open-meteo.com https://air-quality-api.open-meteo.com https://*.onesignal.com https://onesignal.com wss://*.onesignal.com https://*.tradingview.com wss://*.tradingview.com",
              "worker-src 'self' blob:",
              "frame-src 'self' https://accounts.google.com https://www.google.com https://*.google.com https://*.firebaseapp.com https://nahaberapp.firebaseapp.com https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com https://www.dailymotion.com https://*.dailymotion.com https://player.twitch.tv https://clips.twitch.tv https://*.onesignal.com https://s3.tradingview.com https://*.tradingview.com",
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
      'framer-motion',
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
