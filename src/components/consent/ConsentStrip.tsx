'use client'

import { useEffect, useState } from 'react'
import { getConsent, onConsentChange } from '@/lib/consent'
import { isCapacitorNative } from '@/lib/platform'
import { CookieConsentModal } from './CookieConsentModal'

/**
 * ConsentStrip — KVKK/çerez onayı modal'ı.
 *
 * App Store Review uyumluluk (Guideline 5.1.2(i)):
 *  iOS Capacitor native shell'de hiç render edilmez. Apple, WebView içinde
 *  custom "tracking allow" prompt'larını reddediyor; native iOS app'imiz
 *  takip amaçlı veri toplamadığı için ATT framework çağrısına da gerek
 *  yok — sadece bu UI'ı native context'ten gizliyoruz.
 */
export function ConsentStrip() {
  const [mounted, setMounted] = useState(false)
  const [showCookie, setShowCookie] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!mounted) return
    if (isCapacitorNative()) return
    setShowCookie(getConsent() === null)
  }, [mounted])

  useEffect(() => {
    return onConsentChange((detail) => {
      if (isCapacitorNative()) return
      if (detail.open) setShowCookie(true)
    })
  }, [])

  if (!mounted || !showCookie) return null
  if (isCapacitorNative()) return null

  return (
    <CookieConsentModal
      onAccept={() => setShowCookie(false)}
      onReject={() => setShowCookie(false)}
    />
  )
}
