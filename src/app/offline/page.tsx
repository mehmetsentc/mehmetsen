import type { Metadata } from 'next'
import Link from 'next/link'
import { Home, Wifi } from 'lucide-react'
import { ROUTES } from '@/constants/routes'
import { OfflineRetryButton } from './OfflineRetryButton'

export const metadata: Metadata = {
  title: 'Çevrimdışısın',
  description: 'İnternet bağlantın yok. Bağlantı geri geldiğinde NaHaber\'a dönebilirsin.',
  robots: { index: false, follow: false },
}

/**
 * /offline — F5
 *
 * Service Worker'ın fetch fallback'i olarak servis edilir. Bağlantı
 * yokken kullanıcıya nazik bir geri dönüş ekranı gösterir.
 *
 * Pure SSR — JS bağımlı olmayacak şekilde sade, çünkü offline JS
 * çalışsa bile dynamic data çekemez.
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-bg-base px-6 py-12 text-center">
      <div className="relative mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-brand-500/10 text-brand-500">
        <Wifi className="h-12 w-12" strokeWidth={1.5} />
        <span className="absolute inset-0 m-auto h-[2px] w-16 rotate-45 rounded-full bg-brand-500" />
      </div>

      <h1 className="text-2xl font-black tracking-tight text-text-primary sm:text-3xl">
        Çevrimdışısın
      </h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-text-tertiary sm:text-base">
        İnternet bağlantın yok gibi görünüyor. Bağlantı geri geldiğinde
        NaHaber&apos;ı kaldığın yerden okumaya devam edebilirsin.
      </p>

      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        <Link
          href={ROUTES.FEED}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-brand transition-colors hover:bg-brand-600"
        >
          <Home className="h-4 w-4" />
          Ana sayfaya dön
        </Link>
        <OfflineRetryButton />
      </div>

      <p className="mt-10 text-2xs text-text-muted">
        NaHaber çevrimdışı bazı içerikleri önbelleğinde tutar. Tekrar
        bağlandığında otomatik senkronlanır.
      </p>
    </main>
  )
}
