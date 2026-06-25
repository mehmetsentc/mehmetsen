'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle, Home, RefreshCcw } from 'lucide-react'
import { ROUTES } from '@/constants/routes'

/**
 * Route-level error boundary — sayfa içi hata için.
 * Production'da Vercel error logging'e gönderilir (digest ile).
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') {
      // Vercel'in /_logs paneline gider; Sentry/Datadog entegrasyonu eklenirse burada
      console.error('[App Error]', {
        message: error.message,
        digest: error.digest,
      })
    }
  }, [error])

  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-bg-base px-6 py-12 text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-danger/10 text-danger">
        <AlertTriangle className="h-10 w-10" strokeWidth={1.6} />
      </div>

      <h1 className="text-2xl font-black tracking-tight text-text-primary sm:text-3xl">
        Bir şeyler ters gitti
      </h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-text-tertiary sm:text-base">
        Beklenmedik bir hata oluştu. Tekrar deneyebilir ya da ana sayfaya
        dönebilirsin. Sorun devam ederse ekibimize haber veririz.
      </p>

      {error.digest ? (
        <p className="mt-2 font-mono text-2xs text-text-muted">
          Hata kimliği: <span className="text-text-secondary">{error.digest}</span>
        </p>
      ) : null}

      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-brand transition-colors hover:bg-brand-600"
        >
          <RefreshCcw className="h-4 w-4" />
          Tekrar dene
        </button>
        <Link
          href={ROUTES.FEED}
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-bg-card px-4 py-2.5 text-sm font-semibold text-text-primary transition-colors hover:bg-bg-subtle"
        >
          <Home className="h-4 w-4" />
          Ana sayfa
        </Link>
      </div>
    </main>
  )
}
