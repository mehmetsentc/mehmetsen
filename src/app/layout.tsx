import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { cookies } from 'next/headers'
import { Toaster } from 'react-hot-toast'
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
import './globals.css'

const inter = Inter({ subsets: ['latin', 'latin-ext'] })

const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || 'http://localhost:3000'
const appName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: { default: appName, template: `%s | ${appName}` },
  description: 'Güncel haberleri takip et, paylaş ve tartış. Haberler, düşünceler ve yorumlar.',
  openGraph: {
    type: 'website',
    locale: 'tr_TR',
    siteName: appName,
    title: appName,
    description: 'Güncel haberleri takip et, paylaş ve tartış. Haberler, düşünceler ve yorumlar.',
  },
  twitter: {
    card: 'summary_large_image',
    title: appName,
    description: 'Güncel haberleri takip et, paylaş ve tartış. Haberler, düşünceler ve yorumlar.',
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
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const initialLanguage = resolveInitialLanguage(
    cookieStore.get(LANGUAGE_COOKIE)?.value,
    cookieStore.get(COUNTRY_COOKIE)?.value
  )

  return (
    <html lang={initialLanguage} suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeScript />
        <PlatformScript />
        <ThemeProvider>
          <LanguageProvider initialLanguage={initialLanguage}>
            <AuthProvider>
              {children}
              <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
            </AuthProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
