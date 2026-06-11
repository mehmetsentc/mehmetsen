'use client'

import { useEffect, useState } from 'react'
import { getConsent, onConsentChange } from '@/lib/consent'
import { CookieConsentModal } from './CookieConsentModal'

// ConsentStrip: Sadece KVKK/çerez onayını gösterir.
// "İçerik kuralları" politikası kaldırıldı — misafirler haberleri serbestçe okuyabilir.
// Çerez onayı localStorage'a kaydedilir, bir daha sorulmaz (365 gün).
export function ConsentStrip() {
  const [mounted, setMounted] = useState(false)
  const [showCookie, setShowCookie] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!mounted) return
    setShowCookie(getConsent() === null)
  }, [mounted])

  useEffect(() => {
    return onConsentChange((detail) => {
      if (detail.open) setShowCookie(true)
    })
  }, [])

  if (!mounted || !showCookie) return null

  return (
    <CookieConsentModal
      onAccept={() => setShowCookie(false)}
      onReject={() => setShowCookie(false)}
    />
  )
}
