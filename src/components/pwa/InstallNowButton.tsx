'use client'

import { useCallback, useEffect, useState } from 'react'
import { Download, Check, Smartphone, Share } from 'lucide-react'
import { isNativeApp, isPwaStandaloneDisplay } from '@/lib/platform'

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
  prompt(): Promise<void>
}

type Platform = 'ios' | 'android' | 'desktop' | 'unknown'
type IOSBrowser = 'safari' | 'chrome' | 'other'
type InstallState = 'installed' | 'available' | 'ios-hint' | 'desktop-hint' | 'unknown'

/**
 * /uygulama sayfasındaki birincil "Ana ekrana ekle" butonu.
 *  - Chromium + beforeinstallprompt → native prompt()
 *  - iOS (Safari veya Chrome) → Paylaş → Ana Ekrana Ekle rehberi
 *    (JS ile native install yok; navigator.share Ana Ekrana Ekle göstermez)
 */
export function InstallNowButton() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [platform, setPlatform] = useState<Platform>('unknown')
  const [iosBrowser, setIOSBrowser] = useState<IOSBrowser>('safari')
  const [state, setState] = useState<InstallState>('unknown')
  const [showHint, setShowHint] = useState(false)

  useEffect(() => {
    // Already in App Store / Play Capacitor shell — treat as installed
    if (isNativeApp()) {
      setState('installed')
      return
    }

    const ua = navigator.userAgent.toLowerCase()
    const isIOSDevice =
      /iphone|ipad|ipod/.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    const isAndroid = /android/.test(ua)

    const detected: Platform = isIOSDevice ? 'ios' : isAndroid ? 'android' : 'desktop'
    setPlatform(detected)

    if (isIOSDevice) {
      if (/crios/.test(ua)) setIOSBrowser('chrome')
      else if (/fxios|edgios|opios/.test(ua)) setIOSBrowser('other')
      else setIOSBrowser('safari')
    }

    if (isPwaStandaloneDisplay()) {
      setState('installed')
      return
    }

    // iOS never exposes beforeinstallprompt (Safari or Chrome/Firefox wrappers)
    if (isIOSDevice) {
      setState('ios-hint')
      return
    }
    if (detected === 'desktop') setState('desktop-hint')

    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
      setState('available')
    }
    const onInstalled = () => setState('installed')

    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const handleClick = useCallback(async () => {
    if (state === 'available' && deferred) {
      try {
        await deferred.prompt()
        const choice = await deferred.userChoice
        if (choice.outcome === 'accepted') {
          setState('installed')
        }
        setDeferred(null)
      } catch {
        /* ignore */
      }
      return
    }
    setShowHint((s) => !s)
  }, [state, deferred])

  if (state === 'installed') {
    return (
      <button
        type="button"
        disabled
        className="inline-flex items-center gap-2 rounded-full bg-green-500/15 px-6 py-3 text-base font-semibold text-green-500"
      >
        <Check className="h-5 w-5" />
        Uygulama zaten yüklü
      </button>
    )
  }

  const icon =
    platform === 'ios' ? <Share className="h-5 w-5" />
    : platform === 'android' ? <Smartphone className="h-5 w-5" />
    : <Download className="h-5 w-5" />

  const label =
    state === 'available' ? 'Ana ekrana ekle'
    : platform === 'ios' ? 'Ana ekrana ekle'
    : platform === 'android' ? 'Ana ekrana ekle'
    : 'Bilgisayara yükle'

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleClick}
        className="inline-flex items-center gap-2 rounded-full bg-brand-500 px-6 py-3 text-base font-bold text-white shadow-lg shadow-brand-500/30 transition-all hover:scale-105 hover:bg-brand-600 active:scale-100"
      >
        {icon}
        {label}
      </button>

      {showHint && state !== 'available' && (
        <div className="absolute left-1/2 top-full z-50 mt-3 w-[320px] -translate-x-1/2 rounded-2xl border border-border bg-bg-card p-4 shadow-2xl">
          {state === 'ios-hint' && (
            <div className="text-left text-sm text-text-secondary">
              <p className="mb-2 font-bold text-text-primary">iPhone / iPad&apos;de ekle:</p>
              <p className="mb-2 text-xs text-text-tertiary">
                Apple tek dokunuşlu kurulum API&apos;si sunmaz. Safari veya Chrome&apos;da
                Paylaş → Ana Ekrana Ekle ile eklenir.
              </p>
              <ol className="space-y-1 pl-5 list-decimal">
                {iosBrowser === 'chrome' ? (
                  <>
                    <li>Üst adres çubuğunda <strong>Paylaş</strong> (□↑) ikonuna dokun</li>
                    <li>Aşağı kaydır → <strong>Ana Ekrana Ekle</strong></li>
                    <li>Sağ üstte <strong>Ekle</strong> dokun</li>
                  </>
                ) : iosBrowser === 'safari' ? (
                  <>
                    <li>Alt çubukta <strong>Paylaş</strong> (□↑) ikonuna dokun</li>
                    <li>Aşağı kaydır → <strong>Ana Ekrana Ekle</strong></li>
                    <li>Sağ üstte <strong>Ekle</strong> dokun</li>
                  </>
                ) : (
                  <>
                    <li><strong>Paylaş</strong> (□↑) veya ⋯ menüsünü aç</li>
                    <li><strong>Ana Ekrana Ekle</strong>&apos;yi seç</li>
                    <li><strong>Ekle</strong> dokun</li>
                  </>
                )}
              </ol>
            </div>
          )}
          {state === 'desktop-hint' && (
            <div className="text-left text-sm text-text-secondary">
              <p className="mb-2 font-bold text-text-primary">Masaüstüne yükle:</p>
              <ol className="space-y-1 pl-5 list-decimal">
                <li>Chrome / Edge adres çubuğunun sağında <strong>⊕ kurulum ikonu</strong> görünür</li>
                <li>Veya menü → <strong>NaHaber&apos;ı Yükle</strong></li>
                <li>Onayla — uygulama kendi penceresinde açılır</li>
              </ol>
              <p className="mt-2 text-xs text-text-tertiary">
                İkonu görmüyorsan tarayıcın PWA desteklemiyor olabilir — Chrome / Edge öneririz.
              </p>
            </div>
          )}
          {state === 'unknown' && (
            <p className="text-sm text-text-secondary">
              Tarayıcın PWA kurulumunu yakalayamadı. Aşağıdaki adımlardan platformuna
              uygun olanı takip et.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
