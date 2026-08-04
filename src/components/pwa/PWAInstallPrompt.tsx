'use client'

import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Download, Share, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
  prompt(): Promise<void>
}

const DISMISS_KEY = 'nahaber:pwa-install-dismissed-at'
const DISMISS_DAYS = 14

function isStandaloneDisplay(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/** Any iPhone/iPad/iPod — including Chrome/Firefox iOS (no beforeinstallprompt). */
function detectIOS(): { isIOS: boolean; isSafari: boolean } {
  const ua = navigator.userAgent.toLowerCase()
  const isIOS =
    /iphone|ipad|ipod/.test(ua) ||
    // iPadOS 13+ desktop UA
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const isSafari = isIOS && !/crios|fxios|edgios|opios/.test(ua)
  return { isIOS, isSafari }
}

/**
 * PWAInstallPrompt — F5
 *
 * Android/Chrome/Edge: catch beforeinstallprompt → custom one-tap "Yükle".
 * iOS: Apple does not expose a programmatic install API — soft banner guides
 * Share → Ana Ekrana Ekle (Safari only; other iOS browsers get "Safari'de aç").
 */
export function PWAInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [isSafari, setIsSafari] = useState(false)
  const [installed, setInstalled] = useState(false)

  const isRecentlyDismissed = useCallback((): boolean => {
    try {
      const at = localStorage.getItem(DISMISS_KEY)
      if (!at) return false
      const ts = Number(at)
      if (!Number.isFinite(ts)) return false
      return Date.now() - ts < DISMISS_DAYS * 86_400_000
    } catch {
      return false
    }
  }, [])

  useEffect(() => {
    setInstalled(isStandaloneDisplay())
    const { isIOS: ios, isSafari: safari } = detectIOS()
    setIsIOS(ios)
    setIsSafari(safari)
  }, [])

  useEffect(() => {
    if (installed) return
    if (isRecentlyDismissed()) return

    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
      window.setTimeout(() => setVisible(true), 4_500)
    }

    const onInstalled = () => {
      setInstalled(true)
      setVisible(false)
    }

    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)

    // iOS never fires beforeinstallprompt — soft guide after engagement delay
    if (isIOS) {
      const t = window.setTimeout(() => setVisible(true), 6_000)
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
  }, [installed, isIOS, isRecentlyDismissed])

  const dismiss = useCallback(() => {
    setVisible(false)
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()))
    } catch {
      /* ignore */
    }
  }, [])

  const install = useCallback(async () => {
    if (!deferred) return
    try {
      await deferred.prompt()
      const choice = await deferred.userChoice
      if (choice.outcome === 'accepted') {
        setInstalled(true)
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

  if (installed) return null

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 64, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 64, opacity: 0 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-x-3 bottom-3 z-banner sm:left-auto sm:right-4 sm:w-[380px]"
          role="dialog"
          aria-label="NaHaber uygulamayı yükle"
        >
          <div className="relative overflow-hidden rounded-2xl border border-border bg-bg-card/95 p-4 shadow-2xl backdrop-blur-xl">
            <button
              type="button"
              onClick={dismiss}
              aria-label="Kapat"
              className="absolute right-2 top-2 rounded-full p-1 text-text-tertiary transition-colors hover:bg-bg-subtle"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex items-start gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-500">
                {isIOS ? <Share className="h-6 w-6" /> : <Download className="h-6 w-6" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-text-primary">
                  NaHaber&apos;ı ana ekranına ekle
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-text-tertiary">
                  {isIOS
                    ? isSafari
                      ? 'Safari\'de Paylaş → "Ana Ekrana Ekle" ile uygulama gibi açılır.'
                      : 'iPhone\'da ana ekrana ekleme yalnızca Safari ile mümkün.'
                    : 'Tek dokunuşla yükle — daha hızlı erişim ve bildirimler.'}
                </p>
              </div>
            </div>

            {!isIOS && deferred ? (
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={dismiss}>
                  Şimdi değil
                </Button>
                <Button variant="solid" size="sm" onClick={install} leftIcon={<Download className="h-3.5 w-3.5" />}>
                  Yükle
                </Button>
              </div>
            ) : isIOS ? (
              <div className="mt-3 rounded-xl bg-bg-subtle/60 px-3 py-2 text-2xs leading-relaxed text-text-tertiary">
                {isSafari ? (
                  <>
                    Alt çubuktaki <strong>Paylaş</strong> (□↑) → aşağı kaydır →{' '}
                    <strong>Ana Ekrana Ekle</strong> → <strong>Ekle</strong>.
                  </>
                ) : (
                  <>
                    <strong>Safari</strong>&apos;de nahaber.com aç → Paylaş →{' '}
                    <strong>Ana Ekrana Ekle</strong>. Chrome/Firefox iOS bunu desteklemez.
                  </>
                )}
              </div>
            ) : null}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
