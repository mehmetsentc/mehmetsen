'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { X, Cookie } from 'lucide-react'

const CONSENT_KEY = 'nahaber-cookie-consent'
const CONSENT_VERSION = '1'

type ConsentState = 'accepted' | 'rejected' | null

export function CookieConsentBanner() {
  const [consent, setConsent] = useState<ConsentState | 'loading'>('loading')

  useEffect(() => {
    try {
      const stored = localStorage.getItem(CONSENT_KEY)
      setConsent(stored === 'accepted' ? 'accepted' : stored === 'rejected' ? 'rejected' : null)
    } catch {
      setConsent(null)
    }
  }, [])

  const save = (value: 'accepted' | 'rejected') => {
    try {
      localStorage.setItem(CONSENT_KEY, value)
      localStorage.setItem(`${CONSENT_KEY}-version`, CONSENT_VERSION)
      localStorage.setItem(`${CONSENT_KEY}-date`, new Date().toISOString())
    } catch { /* private mode */ }
    setConsent(value)
  }

  // Still loading or already answered
  if (consent !== null) return null

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Çerez ve Gizlilik Onayı"
      className="fixed bottom-0 left-0 right-0 z-[9999] bg-[rgb(var(--color-card))] border-t border-[rgb(var(--color-border))] shadow-2xl"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:gap-6 sm:px-6 sm:py-5">
        {/* Icon + text */}
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <Cookie className="mt-0.5 h-5 w-5 shrink-0 text-[rgb(var(--color-brand))]" aria-hidden />
          <p className="text-sm leading-relaxed text-[rgb(var(--color-text))]">
            Sitemizde daha iyi bir deneyim sunmak için çerez kullanıyoruz. Kişisel verileriniz{' '}
            <Link href="/hukuk/kvkk" className="font-semibold text-[rgb(var(--color-brand))] hover:underline">
              KVKK
            </Link>{' '}
            ve{' '}
            <Link href="/hukuk/gizlilik" className="font-semibold text-[rgb(var(--color-brand))] hover:underline">
              Gizlilik Politikamız
            </Link>{' '}
            kapsamında işlenmektedir.{' '}
            <Link href="/hukuk/cerez-politikasi" className="text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-brand))] hover:underline">
              Çerez Politikası
            </Link>
          </p>
        </div>

        {/* Buttons */}
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => save('rejected')}
            className="rounded-xl border border-[rgb(var(--color-border))] px-4 py-2 text-sm font-semibold text-[rgb(var(--color-muted))] transition-colors hover:bg-[rgb(var(--color-surface))] hover:text-[rgb(var(--color-text))]"
          >
            Reddet
          </button>
          <button
            type="button"
            onClick={() => save('accepted')}
            className="rounded-xl bg-[rgb(var(--color-brand))] px-5 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90"
          >
            Kabul Et
          </button>
          <button
            type="button"
            onClick={() => save('rejected')}
            aria-label="Kapat"
            className="rounded-lg p-1.5 text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
