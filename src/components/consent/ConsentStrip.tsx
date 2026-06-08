'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Cookie, ShieldCheck, X, ChevronRight } from 'lucide-react'
import { ROUTES } from '@/constants/routes'
import { CONSENT_COPY } from '@/constants/legal'
import {
  CONSENT_ACCEPT_ALL,
  CONSENT_REJECT_ALL,
  getConsent,
  onConsentChange,
  setConsent,
} from '@/lib/consent'
import { hasFeedGuestConsent, setFeedGuestConsent } from '@/lib/feedConsent'
import { useAuth } from '@/hooks/useAuth'

type Step = 'cookie' | 'policy' | null

export function ConsentStrip() {
  const [mounted, setMounted] = useState(false)
  const [step, setStep] = useState<Step>(null)
  const { user } = useAuth()
  const pathname = usePathname()
  const router = useRouter()

  const onFeedPage = pathname === ROUTES.FEED

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return

    // Cookie consent comes first
    if (getConsent() === null) {
      setStep('cookie')
      return
    }

    // Feed policy for guests on feed page
    if (onFeedPage && !user && !hasFeedGuestConsent()) {
      setStep('policy')
      return
    }

    setStep(null)
  }, [mounted, onFeedPage, user])

  // Let settings page reopen cookie preferences
  useEffect(() => {
    return onConsentChange((detail) => {
      if (detail.open) setStep('cookie')
    })
  }, [])

  // Allow other components to trigger the policy step
  useEffect(() => {
    const handler = () => setStep('policy')
    window.addEventListener('openFeedPolicy', handler)
    return () => window.removeEventListener('openFeedPolicy', handler)
  }, [])

  const acceptCookies = useCallback(() => {
    setConsent(CONSENT_ACCEPT_ALL)
    // After cookies: check if policy needed
    if (onFeedPage && !user && !hasFeedGuestConsent()) {
      setStep('policy')
    } else {
      setStep(null)
    }
  }, [onFeedPage, user])

  const rejectCookies = useCallback(() => {
    setConsent(CONSENT_REJECT_ALL)
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
    router.push(ROUTES.HOME ?? '/')
  }, [router])

  if (!mounted || step === null) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-[120] px-3 pb-3 sm:px-6 sm:pb-4">
      <div className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] shadow-2xl">
        {/* accent bar */}
        <div
          className="h-0.5 w-full"
          style={{
            background:
              step === 'cookie'
                ? 'linear-gradient(90deg,#2563eb,#7c3aed)'
                : 'linear-gradient(90deg,#c8102e,#e8294b)',
          }}
        />

        <div className="flex items-center gap-3 px-4 py-3 sm:px-5 sm:py-4">
          {/* icon */}
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
              step === 'cookie' ? 'bg-blue-600/10 text-blue-600' : 'bg-red-600/10 text-red-600'
            }`}
          >
            {step === 'cookie' ? (
              <Cookie className="h-5 w-5" />
            ) : (
              <ShieldCheck className="h-5 w-5" />
            )}
          </span>

          {/* text */}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[rgb(var(--color-text))]">
              {step === 'cookie' ? CONSENT_COPY.title : 'İçerik kuralları'}
            </p>
            <p className="mt-0.5 line-clamp-1 text-xs text-[rgb(var(--color-muted))]">
              {step === 'cookie'
                ? 'Zorunlu çerezler + isteğe bağlı analitik ve kişiselleştirme çerezleri.'
                : 'Platformda yasadışı, müstehcen veya yasaklı içeriklere izin verilmez.'}
              {step === 'cookie' && (
                <Link
                  href={ROUTES.SETTINGS_PRIVACY_POLICY ?? '/ayarlar/gizlilik'}
                  className="ml-1 font-medium text-blue-600 hover:underline"
                >
                  {CONSENT_COPY.privacyPolicyLink}
                </Link>
              )}
              {step === 'policy' && (
                <Link
                  href={ROUTES.FEED_CONTENT_POLICY ?? '/kurallar'}
                  className="ml-1 font-medium text-red-600 hover:underline"
                >
                  Tüm kurallar <ChevronRight className="inline h-3 w-3" />
                </Link>
              )}
            </p>
          </div>

          {/* actions */}
          <div className="flex shrink-0 items-center gap-2">
            {step === 'cookie' && (
              <button
                type="button"
                onClick={rejectCookies}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-[rgb(var(--color-muted))] hover:bg-[rgb(var(--color-surface))]"
              >
                {CONSENT_COPY.rejectAll}
              </button>
            )}
            {step === 'policy' && (
              <button
                type="button"
                onClick={declinePolicy}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-[rgb(var(--color-muted))] hover:bg-[rgb(var(--color-surface))]"
              >
                Çık
              </button>
            )}
            <button
              type="button"
              onClick={step === 'cookie' ? acceptCookies : acceptPolicy}
              className={`rounded-lg px-4 py-1.5 text-xs font-bold text-white ${
                step === 'cookie'
                  ? 'bg-blue-600 hover:bg-blue-700'
                  : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              {step === 'cookie' ? 'Kabul Et' : 'Kabul ediyorum'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
