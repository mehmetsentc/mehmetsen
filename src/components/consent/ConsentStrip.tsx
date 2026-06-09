'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ChevronRight, ShieldCheck } from 'lucide-react'
import { ROUTES } from '@/constants/routes'
import {
  getConsent,
  onConsentChange,
  setConsent,
  CONSENT_ACCEPT_ALL,
  CONSENT_REJECT_ALL,
} from '@/lib/consent'
import { hasFeedGuestConsent, setFeedGuestConsent } from '@/lib/feedConsent'
import { useAuth } from '@/hooks/useAuth'
import { CookieConsentModal } from './CookieConsentModal'

type Step = 'cookie' | 'policy' | null

export function ConsentStrip() {
  const [mounted, setMounted] = useState(false)
  const [step, setStep] = useState<Step>(null)
  const { user } = useAuth()
  const pathname = usePathname()
  const router = useRouter()

  const onFeedPage = pathname === ROUTES.FEED

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!mounted) return
    if (getConsent() === null) { setStep('cookie'); return }
    if (onFeedPage && !user && !hasFeedGuestConsent()) { setStep('policy'); return }
    setStep(null)
  }, [mounted, onFeedPage, user])

  useEffect(() => {
    return onConsentChange((detail) => {
      if (detail.open) setStep('cookie')
    })
  }, [])

  useEffect(() => {
    const handler = () => setStep('policy')
    window.addEventListener('openFeedPolicy', handler)
    return () => window.removeEventListener('openFeedPolicy', handler)
  }, [])

  const afterCookies = useCallback(() => {
    if (onFeedPage && !user && !hasFeedGuestConsent()) {
      setStep('policy')
    } else {
      setStep(null)
    }
  }, [onFeedPage, user])

  const acceptPolicy = useCallback(() => {
    setFeedGuestConsent()
    setStep(null)
    window.dispatchEvent(new Event('feedConsentGranted'))
  }, [])

  const declinePolicy = useCallback(() => {
    router.push('/')
  }, [router])

  if (!mounted || step === null) return null

  // ── Cookie consent: full-screen modal ─────────────────────────
  if (step === 'cookie') {
    return (
      <CookieConsentModal
        onAccept={afterCookies}
        onReject={afterCookies}
      />
    )
  }

  // ── Feed content policy: small strip ──────────────────────────
  return (
    <div className="fixed inset-x-0 bottom-0 z-[120] px-3 pb-3 sm:px-6 sm:pb-4">
      <div className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] shadow-2xl">
        <div className="h-0.5 w-full bg-gradient-to-r from-[rgb(var(--color-brand))] to-red-400" />
        <div className="flex items-center gap-3 px-4 py-3 sm:px-5 sm:py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-600/10 text-[rgb(var(--color-brand))]">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[rgb(var(--color-text))]">İçerik kuralları</p>
            <p className="mt-0.5 line-clamp-1 text-xs text-[rgb(var(--color-muted))]">
              Platformda yasadışı veya yasaklı içeriklere izin verilmez.{' '}
              <Link
                href={ROUTES.FEED_CONTENT_POLICY ?? '/feed/kurallar'}
                className="font-medium text-[rgb(var(--color-brand))] hover:underline"
              >
                Kurallar <ChevronRight className="inline h-3 w-3" />
              </Link>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={declinePolicy}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-[rgb(var(--color-muted))] hover:bg-[rgb(var(--color-surface))]"
            >
              Çık
            </button>
            <button
              type="button"
              onClick={acceptPolicy}
              className="rounded-lg bg-[rgb(var(--color-brand))] px-4 py-1.5 text-xs font-bold text-white hover:bg-red-700"
            >
              Kabul ediyorum
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
