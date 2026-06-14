import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { cookies } from 'next/headers'
import { Toaster } from 'react-hot-toast'

import { Analytics } from '@vercel/analytics/react'

import { SpeedInsights } from '@vercel/speed-insights/next'
import { AuthProvider } from '@/components/auth/AuthProvider'
import { LanguageProvider } from '@/store/languageContext'
import { ThemeProvider } from '@/store/themeContext'
import { ThemeScript } from '@/components/theme/ThemeScript'
import { PlatformScript } from '@/components/layout/PlatformScript'
import {
  COUNTRY_COOKIE,
  LANGUAGE_COOKIE,
  resolveInitialLanguage,
} from '@/lib/i18n'
import { NEWS_IMAGE_PRECONNECT_HOSTS } from '@/constants/imageHosts'
import './globals.css'

const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  preload: true,
  adjustFontFallback: true,
})

const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || 'https://nahaber.com'
const appName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'
const appDescription = 'Türkiye\'nin anlık haber platformu. Son dakika haberler, spor, teknoloji, ekonomi, dünya ve yerel haberler NaHaber\'de.'

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
  sameAs: [
    'https://twitter.com/nahabercom',
    'https://www.facebook.com/nahabercom',
    'https://www.instagram.com/nahabercom',
  ],
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'editorial',
    email: 'iletisim@nahaber.com',
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
      urlTemplate: `${appUrl}/ara?q={search_term_string}`,
    },
    'query-input': 'required name=search_term_string',
  },
}

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
    apple: '/apple-touch-icon.png',
    shortcut: '/favicon.ico',
  },
  manifest: '/manifest.webmanifest',
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || '',
  },
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const initialLanguage = resolveInitialLanguage(
    cookieStore.get(LANGUAGE_COOKIE)?.value,
    cookieStore.get(COUNTRY_COOKIE)?.value
  )

  return (
    <html lang="tr" suppressHydrationWarning>
      <head>
        {NEWS_IMAGE_PRECONNECT_HOSTS.map((href) => (
          <link key={href} rel="preconnect" href={href} crossOrigin="anonymous" />
        ))}
        <link rel="alternate" type="application/rss+xml" title={`${appName} RSS`} href="/rss.xml" />
        <link rel="alternate" type="application/rss+xml" title={`${appName} Son Dakika`} href="/breaking-news.xml" />
        <link rel="alternate" type="application/rss+xml" title={`${appName} Video`} href="/video-feed.xml" />
        <meta name="geo.region" content="TR" />
        <meta name="geo.placename" content="Türkiye" />
        <meta name="language" content="Turkish" />
        <meta name="revisit-after" content="1 days" />
        <meta name="rating" content="general" />
      </head>
      <body className={inter.className}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
        <ThemeScript />
        <PlatformScript />
        <ThemeProvider>
          <LanguageProvider initialLanguage={initialLanguage}>
            <AuthProvider>
              {children}
              <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
              <Analytics />
              <SpeedInsights />
            </AuthProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
