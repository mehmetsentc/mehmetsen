'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Cookie, ShieldCheck, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ROUTES } from '@/constants/routes'
import { CONSENT_CATEGORIES, CONSENT_COPY } from '@/constants/legal'
import { cn } from '@/lib/utils'
import {
  CONSENT_ACCEPT_ALL,
  CONSENT_DEFAULT,
  CONSENT_REJECT_ALL,
  getConsent,
  isCcpaRegion,
  isGdprRegion,
  onConsentChange,
  setConsent,
  type ConsentCategories,
} from '@/lib/consent'

const PRIVACY_HREF = ROUTES.SETTINGS_PRIVACY_POLICY

function Toggle({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean
  disabled?: boolean
  label: string
  onChange?: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={cn(
        'relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors',
        checked ? 'bg-blue-600' : 'bg-[rgb(var(--color-border))]',
        disabled && 'cursor-not-allowed opacity-60'
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-5' : 'translate-x-0.5'
        )}
      />
    </button>
  )
}

export function ConsentBanner() {
  const [mounted, setMounted] = useState(false)
  const [showBanner, setShowBanner] = useState(false)
  const [showPrefs, setShowPrefs] = useState(false)
  const [draft, setDraft] = useState<ConsentCategories>(CONSENT_DEFAULT)
  const [region, setRegion] = useState<{ gdpr: boolean; ccpa: boolean }>({
    gdpr: false,
    ccpa: false,
  })
  const modalRef = useRef<HTMLDivElement>(null)

  // Read storage only on the client to avoid hydration mismatches.
  useEffect(() => {
    setMounted(true)
    setShowBanner(getConsent() === null)
    setRegion({ gdpr: isGdprRegion(), ccpa: isCcpaRegion() })

    // Allow settings (or anywhere) to reopen the preferences modal.
    return onConsentChange((detail) => {
      if (detail.open) {
        setDraft(detail.record?.categories ?? CONSENT_DEFAULT)
        setShowPrefs(true)
        setShowBanner(false)
      }
    })
  }, [])

  const persist = useCallback((categories: ConsentCategories) => {
    setConsent(categories)
    setShowBanner(false)
    setShowPrefs(false)
  }, [])

  const handleManage = useCallback(() => {
    setDraft(getConsent()?.categories ?? CONSENT_DEFAULT)
    setShowPrefs(true)
  }, [])

  const closePrefs = useCallback(() => {
    setShowPrefs(false)
    // If there is still no decision, fall back to the banner (GDPR requires
    // an explicit choice — don't silently dismiss).
    if (getConsent() === null) setShowBanner(true)
  }, [])

  // Escape closes the preferences modal (but never the initial banner).
  useEffect(() => {
    if (!showPrefs) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePrefs()
    }
    window.addEventListener('keydown', onKey)
    modalRef.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [showPrefs, closePrefs])

  if (!mounted) return null
  if (!showBanner && !showPrefs) return null

  return (
    <>
      {showBanner && !showPrefs && (
        <div
          role="dialog"
          aria-modal="false"
          aria-labelledby="consent-banner-title"
          aria-describedby="consent-banner-desc"
          className="fixed inset-x-0 bottom-0 z-[100] px-3 pb-3 sm:px-6 sm:pb-6"
        >
          <div className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] shadow-2xl">
            {/* top accent strip */}
            <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg, #c8102e 0%, #e8294b 60%, #f59e0b 100%)' }} />

            <div className="p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600">
                  <Cookie className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2
                    id="consent-banner-title"
                    className="text-sm font-bold text-[rgb(var(--color-text))]"
                  >
                    {CONSENT_COPY.title}
                  </h2>
                  <p
                    id="consent-banner-desc"
                    className="mt-0.5 text-xs leading-relaxed text-[rgb(var(--color-muted))]"
                  >
                    {CONSENT_COPY.description}{' '}
                    <Link
                      href={PRIVACY_HREF}
                      className="font-medium text-blue-600 hover:underline"
                    >
                      {CONSENT_COPY.privacyPolicyLink}
                    </Link>
                  </p>
                </div>
              </div>

              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                <button
                  type="button"
                  onClick={handleManage}
                  className="text-xs font-medium text-[rgb(var(--color-muted))] underline-offset-2 hover:text-[rgb(var(--color-text))] hover:underline sm:mr-2"
                >
                  {CONSENT_COPY.managePreferences}
                </button>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => persist(CONSENT_REJECT_ALL)}
                    className="flex-1 sm:flex-none"
                  >
                    {CONSENT_COPY.rejectAll}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => persist(CONSENT_ACCEPT_ALL)}
                    className="flex-1 sm:flex-none"
                  >
                    {CONSENT_COPY.acceptAll}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showPrefs && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="consent-prefs-title"
          className="fixed inset-0 z-[110] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
        >
          <div
            ref={modalRef}
            tabIndex={-1}
            className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] shadow-2xl outline-none sm:rounded-2xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-[rgb(var(--color-border))] p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600/10 text-blue-600">
                  <ShieldCheck className="h-5 w-5" />
                </span>
                <div>
                  <h2
                    id="consent-prefs-title"
                    className="text-base font-semibold text-[rgb(var(--color-text))]"
                  >
                    {CONSENT_COPY.managePreferences}
                  </h2>
                  <p className="mt-1 text-xs leading-relaxed text-[rgb(var(--color-muted))]">
                    {CONSENT_COPY.manageDescription}
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Kapat"
                onClick={closePrefs}
                className="shrink-0 rounded-full p-1 text-[rgb(var(--color-muted))] transition-colors hover:bg-[rgb(var(--color-surface))] hover:text-[rgb(var(--color-text))]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              <div className="divide-y divide-[rgb(var(--color-border))]">
                {CONSENT_CATEGORIES.map((category) => {
                  const isNecessary = category.id === 'necessary'
                  const checked = isNecessary
                    ? true
                    : Boolean(draft[category.id as 'analytics' | 'marketing'])
                  return (
                    <div key={category.id} className="flex items-start justify-between gap-4 py-3.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-[rgb(var(--color-text))]">
                            {category.title}
                          </span>
                          {isNecessary && (
                            <span className="rounded-full bg-[rgb(var(--color-surface))] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[rgb(var(--color-muted))]">
                              Her zaman açık
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs leading-relaxed text-[rgb(var(--color-muted))]">
                          {category.description}
                        </p>
                      </div>
                      <Toggle
                        checked={checked}
                        disabled={isNecessary}
                        label={category.title}
                        onChange={(value) =>
                          setDraft((prev) => ({ ...prev, [category.id]: value }))
                        }
                      />
                    </div>
                  )
                })}
              </div>

              <div className="mt-4 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-4">
                <h3 className="text-sm font-semibold text-[rgb(var(--color-text))]">
                  {CONSENT_COPY.ccpaTitle}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-[rgb(var(--color-muted))]">
                  {CONSENT_COPY.ccpaDescription}
                </p>
                <div className="mt-3 flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium text-[rgb(var(--color-text))]">
                      {CONSENT_COPY.doNotSellLabel}
                    </span>
                    <p className="mt-0.5 text-xs leading-relaxed text-[rgb(var(--color-muted))]">
                      {CONSENT_COPY.doNotSellDescription}
                    </p>
                  </div>
                  <Toggle
                    checked={!draft.sale}
                    label={CONSENT_COPY.doNotSellLabel}
                    onChange={(value) => setDraft((prev) => ({ ...prev, sale: !value }))}
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 border-t border-[rgb(var(--color-border))] p-5 sm:flex-row sm:justify-between">
              <Link
                href={PRIVACY_HREF}
                className="self-center text-sm font-medium text-blue-600 hover:underline"
              >
                {CONSENT_COPY.privacyPolicyLink}
              </Link>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => persist(CONSENT_REJECT_ALL)}
                >
                  {CONSENT_COPY.rejectAll}
                </Button>
                <Button type="button" size="sm" onClick={() => persist(draft)}>
                  {CONSENT_COPY.save}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
