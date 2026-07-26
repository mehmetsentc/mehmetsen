import type { Metadata } from 'next'
import { Inter, Source_Serif_4 } from 'next/font/google'
import { ToastViewport } from '@/components/ui/Toast'

import { AuthProvider } from '@/components/auth/AuthProvider'
import { LanguageProvider } from '@/store/languageContext'
import { ThemeProvider } from '@/store/themeContext'
import { ThemeScript } from '@/components/theme/ThemeScript'
import { PlatformScript } from '@/components/layout/PlatformScript'
import { AnalyticsTracker } from '@/components/layout/AnalyticsTracker'
import { DeferredThirdParty } from '@/components/layout/DeferredThirdParty'
import './globals.css'

const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  preload: true,
  adjustFontFallback: true,
  variable: '--font-inter',
})

const sourceSerif = Source_Serif_4({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  preload: false,
  variable: '--font-serif-display',
})

import { getSiteUrl } from '@/lib/seo'
import { OneSignalProvider } from '@/components/OneSignalProvider'
import { PWAInstallPrompt } from '@/components/pwa/PWAInstallPrompt'
import { ConsentStrip } from '@/components/consent/ConsentStrip'

const appUrl = getSiteUrl()
const appName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'
const appDescription = 'Türkiye\'nin anlık haber platformu. Son dakika haberler, spor, teknoloji, ekonomi, dünya ve yerel haberler NaHaber\'de.'
const socialLinks = [
  process.env.NEXT_PUBLIC_X_URL?.trim() || 'https://x.com/nahabercom',
  process.env.NEXT_PUBLIC_FACEBOOK_URL?.trim() || 'https://www.facebook.com/nahabercom',
  process.env.NEXT_PUBLIC_INSTAGRAM_URL?.trim() || 'https://www.instagram.com/nahabercom',
  process.env.NEXT_PUBLIC_YOUTUBE_URL?.trim() || 'https://www.youtube.com/@nahabercom',
].filter(Boolean)

const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'NewsMediaOrganization',
  name: appName,
  url: appUrl,
  logo: {
    '@type': 'ImageObject',
    url: `${appUrl}/brand/nahaber-logo.png`,
    width: 512,
    height: 512,
  },
  sameAs: socialLinks,
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'editorial',
    email: 'bilgi@nahaber.com',
    availableLanguage: 'Turkish',
  },
  foundingDate: '2024',
  areaServed: 'TR',
  inLanguage: 'tr-TR',
  publishingPrinciples: `${appUrl}/editoryal-ilkeler`,
  actionableFeedbackPolicy: `${appUrl}/iletisim`,
  correctionsPolicy: `${appUrl}/editoryal-ilkeler`,
}

const websiteJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: appName,
  url: appUrl,
  inLanguage: 'tr-TR',
  publisher: { '@type': 'Organization', name: appName, url: appUrl },
  potentialAction: {
    '@type': 'SearchAction',
    target: {
      '@type': 'EntryPoint',
      urlTemplate: `${appUrl}/search?q={search_term_string}`,
    },
    'query-input': 'required name=search_term_string',
  },
}

// Tarayıcı + mağaza dışı PWA olarak da "indirilebilir" olduğumuzu
// Google'a anlat — /uygulama landing'inden ASO trafiği için.
const softwareApplicationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: appName,
  applicationCategory: 'NewsApplication',
  operatingSystem: 'Web, Android, iOS, Windows, macOS, Linux',
  url: appUrl,
  installUrl: `${appUrl}/uygulama`,
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'TRY',
  },
}

const googleSiteVerification = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.trim()
const yandexSiteVerification = process.env.NEXT_PUBLIC_YANDEX_SITE_VERIFICATION?.trim()
const bingSiteVerification = process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION?.trim()

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: `${appName} — Son Dakika Haberler, Güncel Haberler`,
    template: `%s | ${appName}`,
  },
  description: appDescription,
  applicationName: appName,
  keywords: ['son dakika haberler', 'güncel haberler', 'türkiye haberleri', 'haber', 'spor haberleri', 'ekonomi haberleri', 'dünya haberleri', 'nahaber'],
  authors: [{ name: appName, url: appUrl }],
  creator: appName,
  publisher: appName,
  category: 'news',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  alternates: {
    canonical: appUrl,
    languages: {
      'tr-TR': appUrl,
      tr: appUrl,
    },
    types: {
      'application/rss+xml': [
          { url: `${appUrl}/rss.xml`,          title: `${appName} RSS` },
          { url: `${appUrl}/breaking-news.xml`, title: `${appName} Son Dakika` },
          { url: `${appUrl}/video-feed.xml`,    title: `${appName} Video` },
        ],
    },
  },
  openGraph: {
    type: 'website',
    locale: 'tr_TR',
    siteName: appName,
    url: appUrl,
    title: `${appName} — Son Dakika Haberler`,
    description: appDescription,
    images: [
      {
        url: `${appUrl}/brand/og-default.png`,
        width: 1200,
        height: 630,
        alt: appName,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@nahabercom',
    creator: '@nahabercom',
    title: `${appName} — Son Dakika Haberler`,
    description: appDescription,
    images: [`${appUrl}/brand/og-default.png`],
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/brand/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/brand/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
  },
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'NaHaber',
    statusBarStyle: 'black-translucent',
    startupImage: [
      // iPhone 14 Pro Max, 15 Pro Max
      { url: '/brand/splash/iphone-14-pro-max.png', media: '(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
      // iPhone 14 Pro, 15 Pro
      { url: '/brand/splash/iphone-14-pro.png', media: '(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
      // iPhone 14 Plus, 13 Pro Max, 12 Pro Max
      { url: '/brand/splash/iphone-14-plus.png', media: '(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
      // iPhone 14, 13, 13 Pro, 12, 12 Pro
      { url: '/brand/splash/iphone-14.png', media: '(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
      // iPhone 11 Pro Max, XS Max
      { url: '/brand/splash/iphone-11-pro-max.png', media: '(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
      // iPhone 11 Pro, XS, X
      { url: '/brand/splash/iphone-11-pro.png', media: '(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
      // iPhone 11, XR
      { url: '/brand/splash/iphone-11.png', media: '(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)' },
      // iPhone SE, 8, 7, 6s, 6
      { url: '/brand/splash/iphone-se.png', media: '(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)' },
      // iPad Pro 12.9"
      { url: '/brand/splash/ipad-pro-12.png', media: '(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)' },
      // iPad Pro 11"
      { url: '/brand/splash/ipad-pro-11.png', media: '(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)' },
      // iPad Air, iPad
      { url: '/brand/splash/ipad-air.png', media: '(device-width: 820px) and (device-height: 1180px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)' },
    ],
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
  verification: {
    ...(googleSiteVerification ? { google: googleSiteVerification } : {}),
    ...(yandexSiteVerification ? { yandex: yandexSiteVerification } : {}),
    ...(bingSiteVerification
      ? { other: { 'msvalidate.01': bingSiteVerification } }
      : {}),
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // CRITICAL: do NOT call `cookies()` / `headers()` from this layout.
  // Any dynamic API call here opts the entire app out of static rendering,
  // which forces Vercel to serve every page with `cache-control: private,
  // no-cache, no-store` (CDN cache off, ISR ignored, full SSR + Firestore on
  // every request). LanguageProvider already hydrates the user's stored
  // preference client-side from the `lang` cookie, so the SSR shell can
  // safely render with the default language and let the client adjust.
  return (
    <html lang="tr" suppressHydrationWarning data-sidebar="open">
      <head>
        {/* Google Consent Mode v2 — default to denied BEFORE any Google scripts.
            DeferredThirdParty upgrades to 'granted' once the user accepts. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
window.dataLayer=window.dataLayer||[];
function gtag(){dataLayer.push(arguments);}
gtag('consent','default',{
  ad_storage:'denied',
  ad_user_data:'denied',
  ad_personalization:'denied',
  analytics_storage:'denied',
  wait_for_update:500
});
`.trim()
          }}
        />
        <link rel="alternate" type="application/rss+xml" title={`${appName} RSS`} href="/rss.xml" />
        <link rel="alternate" type="application/rss+xml" title={`${appName} Son Dakika`} href="/breaking-news.xml" />
        <link rel="alternate" type="application/rss+xml" title={`${appName} Video`} href="/video-feed.xml" />
        <meta name="geo.region" content="TR" />
        <meta name="geo.placename" content="Türkiye" />
        <meta name="language" content="Turkish" />
        <meta name="revisit-after" content="1 days" />
        <meta name="rating" content="general" />
        {/* PWA: standalone web app desteği — Chromium tabanlı tüm tarayıcılar */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="application-name" content={appName} />
        {/* Microsoft tile (Windows Start menüsüne pin'leme) */}
        <meta name="msapplication-TileColor" content="#dc2626" />
        <meta name="msapplication-tap-highlight" content="no" />
        {/* iOS Safari kaydırma bounce'unu PWA modunda kapatır */}
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5, viewport-fit=cover" />
      </head>
      <body className={`${inter.variable} ${sourceSerif.variable} ${inter.className} font-sans antialiased`}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplicationJsonLd) }}
        />
        <ThemeScript />
        <PlatformScript />
        <OneSignalProvider />
        <ThemeProvider>
          <LanguageProvider>
            <AuthProvider>
              {children}
              {/* Single cookie/KVKK consent UI (replaces CookieConsentBanner strip) */}
              <ConsentStrip />
              {/* F5: PWA "Ana ekrana ekle" prompt */}
              <PWAInstallPrompt />
              {/* F2.5: tüm toast'lar artık sonner ToastViewport üzerinden çıkar
                  (react-hot-toast webpack alias ile shim'e yönlendirildi) */}
              <ToastViewport />
              <AnalyticsTracker />
              <DeferredThirdParty />
            </AuthProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
