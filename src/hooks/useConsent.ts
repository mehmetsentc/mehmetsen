'use client'

import { useEffect, useState } from 'react'
import {
  getConsent,
  onConsentChange,
  type ConsentCategories,
  type ConsentRecord,
} from '@/lib/consent'

export interface UseConsentResult {
  /** The stored decision, or `null` when undecided/expired. */
  consent: ConsentRecord | null
  /** True once the client has read storage (avoids SSR/hydration flashes). */
  ready: boolean
  /** Whether the user has an active, valid decision. */
  hasDecision: boolean
  /** Whether analytics scripts are allowed to load. */
  analyticsAllowed: boolean
  /** Whether marketing/personalization scripts are allowed to load. */
  marketingAllowed: boolean
  /** CCPA: false means the user opted out of sale/sharing ("Do Not Sell"). */
  saleAllowed: boolean
}

/**
 * Read-only view of the current consent decision that re-renders whenever the
 * decision changes (via the {@link CONSENT_EVENT} broadcast). Use this to gate
 * non-essential scripts before initializing them.
 *
 * @example
 * const { analyticsAllowed } = useConsent()
 * useEffect(() => {
 *   if (!analyticsAllowed) return
 *   // TODO: initialize analytics here, e.g. loadAnalytics()
 * }, [analyticsAllowed])
 */
export function useConsent(): UseConsentResult {
  const [consent, setConsentState] = useState<ConsentRecord | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setConsentState(getConsent())
    setReady(true)
    return onConsentChange((detail) => setConsentState(detail.record))
  }, [])

  const categories: ConsentCategories | undefined = consent?.categories

  return {
    consent,
    ready,
    hasDecision: consent !== null,
    analyticsAllowed: categories?.analytics ?? false,
    marketingAllowed: categories?.marketing ?? false,
    saleAllowed: categories?.sale ?? false,
  }
}
