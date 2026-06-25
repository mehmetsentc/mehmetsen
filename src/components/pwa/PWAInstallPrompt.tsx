'use client'

import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Download, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
  prompt(): Promise<void>
}

const DISMISS_KEY = 'nahaber:pwa-install-dismissed-at'
const DISMISS_DAYS = 14

/**
 * PWAInstallPrompt — F5
 *
 * Tarayıcı beforeinstallprompt event'ini yakalayıp custom UI ile
 * gösterir. Reddedildiğinde 14 gün boyunca tekrar gösterilmez.
 *
 * iOS Safari beforeinstallprompt'u tetiklemez — orada Apple'ın native
 * "Ana Ekrana Ekle" akışına yönlendiren küçük bir hint gösteririz.
 *
 * Layout'a tek seferlik mount edilir.
 */
export function PWAInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [installed, setInstalled] = useState(false)

  // ── Daha önce dismiss edildi mi? ──────────────────────────────
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

  // ── Standalone? ─────────────────────────────────────────────────
  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // Apple-only deprecated flag
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true
    setInstalled(standalone)

    const ua = navigator.userAgent.toLowerCase()
    const ios = /iphone|ipad|ipod/.test(ua) && !/crios|fxios/.test(ua)
    setIsIOS(ios)
  }, [])

  // ── Listen for beforeinstallprompt ──────────────────────────────
  useEffect(() => {
    if (installed) return
    if (isRecentlyDismissed()) return

    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
      // Kullanıcı bir süre etkileşim kursun, sonra bar açılır.
      window.setTimeout(() => setVisible(true), 4_500)
    }

    const onInstalled = () => {
      setInstalled(true)
      setVisible(false)
    }

    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)

    // iOS: prompt eventi gelmez — kendi banner'ımızı 6 saniye sonra göster
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
        // Conversion event — Vercel Analytics tarafından otomatik yakalanır
        try {
          window.dispatchEvent(new CustomEvent('pwa:installed', { detail: { source: 'prompt' } }))
        } catch {
          /* ignore */
        }
      } else {
        // Reddedilirse de event ile sayalım (analytics için)
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
                <Download className="h-6 w-6" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-text-primary">
                  NaHaber&apos;ı ana ekranına ekle
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-text-tertiary">
                  {isIOS
                    ? 'Safari\'de Paylaş → "Ana Ekrana Ekle" ile uygulamayı yükleyebilirsin.'
                    : 'Daha hızlı erişim, push bildirimleri ve çevrimdışı okuma için yükle.'}
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
                Safari&apos;nin alt çubuğundaki <strong>Paylaş</strong> ikonuna dokun
                → aşağı kaydır → <strong>Ana Ekrana Ekle</strong>.
              </div>
            ) : null}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
