import type { Metadata } from 'next'
import Link from 'next/link'
import { Compass, Home, Search } from 'lucide-react'
import { ROUTES } from '@/constants/routes'

export const metadata: Metadata = {
  title: 'Sayfa Bulunamadı — 404',
  description:
    'Aradığınız sayfa bulunamadı veya kaldırılmış olabilir. Ana sayfaya dönerek son haberleri okumaya devam edebilirsiniz.',
  robots: { index: false, follow: true },
}

export default function NotFound() {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-bg-base px-6 py-12 text-center">
      <p className="text-[88px] font-black leading-none tracking-tight text-brand-500 sm:text-[112px]">
        404
      </p>

      <h1 className="mt-2 text-xl font-black tracking-tight text-text-primary sm:text-2xl">
        Bu sayfayı bulamadık
      </h1>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-text-tertiary sm:text-base">
        Aradığınız haber kaldırılmış, taşınmış veya hiç var olmamış olabilir.
        NaHaber&apos;ın en sıcak gündemine dönerek okumaya devam edebilirsin.
      </p>

      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        <Link
          href={ROUTES.FEED}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-brand transition-colors hover:bg-brand-600"
        >
          <Home className="h-4 w-4" />
          Ana sayfa
        </Link>
        <Link
          href={ROUTES.SEARCH}
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-bg-card px-4 py-2.5 text-sm font-semibold text-text-primary transition-colors hover:bg-bg-subtle"
        >
          <Search className="h-4 w-4" />
          Haber ara
        </Link>
        <Link
          href={ROUTES.DISCOVER}
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-bg-card px-4 py-2.5 text-sm font-semibold text-text-primary transition-colors hover:bg-bg-subtle"
        >
          <Compass className="h-4 w-4" />
          Keşfet
        </Link>
      </div>

      <p className="mt-10 text-2xs text-text-muted">
        NaHaber &middot; Türkiye&apos;nin anlık haber platformu
      </p>
    </main>
  )
}
