'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { Download, Share, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { isNativeApp, isPwaStandaloneDisplay } from '@/lib/platform'
import { InstallSuccess } from '@/components/pwa/InstallSuccess'

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
  prompt(): Promise<void>
}

const DISMISS_COOKIE = 'nahaber_pwa_dismissed'
const DISMISS_LS_KEY = 'nahaber:pwa-install-dismissed'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 // 1 year

type IOSBrowser = 'safari' | 'chrome' | 'other' | null

/** City subdomain (canakkale.nahaber.com, *.localhost) vs national host. */
function isCityHost(): boolean {
  if (typeof window === 'undefined') return false
  const host = window.location.hostname.split(':')[0].toLowerCase()
  if (host === 'nahaber.com' || host === 'www.nahaber.com' || host === 'localhost' || host === '127.0.0.1') {
    return false
  }
  if (/^[a-z0-9-]+\.localhost$/.test(host)) return true
  if (/^[a-z0-9-]+\.nahaber\.com$/.test(host) && !host.startsWith('www.')) return true
  return false
}

/** National: `/` (pre-redirect) or `/feed` (main home). City: `/` only. */
function isPwaPromptPath(pathname: string): boolean {
  if (isCityHost()) return pathname === '/'
  return pathname === '/' || pathname === '/feed'
}

function isDismissed(): boolean {
  try {
    if (localStorage.getItem(DISMISS_LS_KEY) === '1') return true
  } catch { /* ignore */ }
  try {
    if (document.cookie.includes(`${DISMISS_COOKIE}=1`)) return true
  } catch { /* ignore */ }
  return false
}

function persistDismiss(): void {
  try {
    localStorage.setItem(DISMISS_LS_KEY, '1')
  } catch { /* ignore */ }
  try {
    document.cookie = `${DISMISS_COOKIE}=1; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`
  } catch { /* ignore */ }
}

/**
 * Any iPhone/iPad/iPod — including Chrome/Firefox/Edge wrappers.
 * iOS never fires beforeinstallprompt; install is Share → Ana Ekrana Ekle
 * (Safari + Chrome/Edge/Firefox on iOS 16.4+).
 */
function detectIOSBrowser(): { isIOS: boolean; iosBrowser: IOSBrowser } {
  const ua = navigator.userAgent.toLowerCase()
  const isIOS =
    /iphone|ipad|ipod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  if (!isIOS) return { isIOS: false, iosBrowser: null }
  if (/crios/.test(ua)) return { isIOS: true, iosBrowser: 'chrome' }
  if (/fxios|edgios|opios/.test(ua)) return { isIOS: true, iosBrowser: 'other' }
  return { isIOS: true, iosBrowser: 'safari' }
}

function iosGuide(iosBrowser: IOSBrowser): { summary: string; steps: string[] } {
  if (iosBrowser === 'chrome') {
    return {
      summary: 'Chrome’da tek dokunuşlu yükleme yok — Paylaş menüsünden eklenir.',
      steps: [
        'Üst adres çubuğundaki Paylaş (□↑) ikonuna dokun',
        'Aşağı kaydır → Ana Ekrana Ekle',
        'Sağ üstte Ekle’ye bas',
      ],
    }
  }
  if (iosBrowser === 'safari') {
    return {
      summary: 'Safari’de tek dokunuşlu yükleme yok — Paylaş menüsünden eklenir.',
      steps: [
        'Alt çubuktaki Paylaş (□↑) ikonuna dokun',
        'Aşağı kaydır → Ana Ekrana Ekle',
        'Sağ üstte Ekle’ye bas',
      ],
    }
  }
  return {
    summary: 'iPhone’da ana ekrana ekleme Paylaş menüsünden yapılır.',
    steps: [
      'Paylaş (□↑) veya ⋯ menüsünü aç',
      'Ana Ekrana Ekle’yi seç',
      'Ekle’ye bas',
    ],
  }
}

/**
 * PWAInstallPrompt — tek toast / popup
 *
 * Android/Chrome/Edge: beforeinstallprompt → "Ana ekrana ekle" → native prompt().
 * iOS (Safari + Chrome iOS): aynı toast; buton kısa rehberi açar.
 *   JS ile native install tetiklenemez — navigator.share() da Ana Ekrana Ekle vermez.
 */
export function PWAInstallPrompt() {
  const pathname = usePathname()
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [iosBrowser, setIOSBrowser] = useState<IOSBrowser>(null)
  const [installed, setInstalled] = useState(false)
  const [iosGuideOpen, setIOSGuideOpen] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const hasDismissedRef = useRef(false)

  const isPwaHome = isPwaPromptPath(pathname)

  useEffect(() => {
    // App Store / Play shell: never show “Ana ekrana ekle” toast
    if (isNativeApp()) {
      setInstalled(true)
      return
    }
    setInstalled(isPwaStandaloneDisplay())
    const { isIOS: ios, iosBrowser: browser } = detectIOSBrowser()
    setIsIOS(ios)
    setIOSBrowser(browser)
    hasDismissedRef.current = isDismissed()
  }, [])

  useEffect(() => {
    if (!isPwaHome) { setVisible(false); return }
    if (installed) return
    if (isNativeApp()) return
    if (hasDismissedRef.current) return

    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
      if (!hasDismissedRef.current) {
        window.setTimeout(() => setVisible(true), 4_500)
      }
    }

    const onInstalled = () => {
      setInstalled(true)
      setVisible(false)
      setShowSuccess(true)
    }

    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)

    if (isIOS) {
      const t = window.setTimeout(() => {
        if (!hasDismissedRef.current) setVisible(true)
      }, 6_000)
      return () => {
        clearTimeout(t)
        window.removeEventListener('beforeinstallprompt', onPrompt)
        window.removeEventListener('appinstalled', onInstalled)
      }
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [installed, isIOS, isPwaHome])

  const dismiss = useCallback(() => {
    setVisible(false)
    setIOSGuideOpen(false)
    hasDismissedRef.current = true
    persistDismiss()
  }, [])

  const install = useCallback(async () => {
    if (!deferred) return
    try {
      await deferred.prompt()
      const choice = await deferred.userChoice
      if (choice.outcome === 'accepted') {
        setInstalled(true)
        setShowSuccess(true)
        try {
          window.dispatchEvent(new CustomEvent('pwa:installed', { detail: { source: 'prompt' } }))
        } catch {
          /* ignore */
        }
      } else {
        try {
          window.dispatchEvent(new CustomEvent('pwa:install-dismissed', { detail: { source: 'prompt' } }))
        } catch {
          /* ignore */
        }
      }
      setVisible(false)
      setDeferred(null)
    } catch {
      setVisible(false)
    }
  }, [deferred])

  const onPrimary = useCallback(() => {
    if (!isIOS && deferred) {
      void install()
      return
    }
    // iOS: no programmatic install — reveal shortest guided steps
    setIOSGuideOpen(true)
  }, [isIOS, deferred, install])

  if (installed && !showSuccess) return null

  const guide = iosGuide(iosBrowser)
  const canNativeInstall = !isIOS && !!deferred

  return (
    <>
    {showSuccess ? <InstallSuccess onContinue={() => setShowSuccess(false)} /> : null}
    <AnimatePresence>
      {visible && !showSuccess && (
        <motion.div
          initial={{ y: 64, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 64, opacity: 0 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-0 z-[410] flex items-end justify-center bg-black/65 px-4 pb-8 sm:items-center"
          role="dialog"
          aria-label="NaHaber ana ekrana ekle"
        >
          <div className="nah-install-modal relative w-full overflow-hidden p-5">
            <button
              type="button"
              onClick={dismiss}
              aria-label="Kapat"
              className="absolute right-2 top-2 rounded-full p-1 text-[rgb(var(--color-muted))]"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="mx-auto mb-4 flex h-[7.5rem] w-[4.4rem] items-center justify-center rounded-[1.6rem] border border-white/10 bg-black">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[rgb(var(--nah-red))] text-lg font-black text-white">
                N
              </span>
            </div>
            <h2 className="text-center text-xl font-extrabold text-[rgb(var(--color-text))]">
              NaHaber&apos;i telefonuna ekle
            </h2>
            <p className="mt-2 text-center text-sm leading-relaxed text-[rgb(var(--color-muted))]">
              {isIOS
                ? guide.summary
                : 'Haberler tek dokunuş uzağında. Daha hızlı, daha pratik, senin için.'}
            </p>
            <ul className="mt-4 space-y-1.5 text-sm text-[rgb(var(--color-text))]">
              <li>Ana ekranda NaHaber ikonu</li>
              <li>Tek dokunuşla açılış</li>
              <li>Daha hızlı ve akıcı deneyim</li>
              <li>Kişiselleştirilmiş haber akışı</li>
            </ul>

            {(canNativeInstall || isIOS) && (
              <div className="mt-5 space-y-2">
                <button type="button" className="nah-cta" onClick={onPrimary}>
                  {isIOS ? <Share className="mr-2 inline h-4 w-4" /> : <Download className="mr-2 inline h-4 w-4" />}
                  NaHaber&apos;i Ana Ekrana Ekle
                </button>
                <Button variant="ghost" size="sm" onClick={dismiss} className="w-full text-[rgb(var(--color-muted))]">
                  Şimdi değil
                </Button>
              </div>
            )}

            <AnimatePresence>
              {isIOS && iosGuideOpen && (
                <motion.ol
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.22 }}
                  className="mt-3 space-y-1.5 overflow-hidden rounded-xl bg-bg-subtle/60 px-3 py-2.5 text-2xs leading-relaxed text-text-tertiary"
                >
                  {guide.steps.map((step, i) => (
                    <li key={step} className="flex gap-2">
                      <span className="font-bold text-brand-500">{i + 1}.</span>
                      <span>
                        {step.split(/(Paylaş \(□↑\)|Ana Ekrana Ekle|Ekle)/g).map((part, j) =>
                          /^(Paylaş \(□↑\)|Ana Ekrana Ekle|Ekle)$/.test(part) ? (
                            <strong key={j} className="text-text-secondary">
                              {part}
                            </strong>
                          ) : (
                            <span key={j}>{part}</span>
                          ),
                        )}
                      </span>
                    </li>
                  ))}
                  {iosBrowser === 'chrome' && (
                    <li className="pt-0.5 text-[10px] text-text-tertiary/80">
                      İpucu: Paylaş ikonu adres çubuğunun sağında.
                    </li>
                  )}
                </motion.ol>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
    </>
  )
}
