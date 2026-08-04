'use client'

import { useEffect, useState } from 'react'
import Script from 'next/script'

declare global {
  interface Window {
    OneSignalDeferred?: ((OneSignal: OneSignalSDK) => Promise<void> | void)[]
  }
}

interface OneSignalSDK {
  init(config: Record<string, unknown>): Promise<void>
  Notifications: {
    requestPermission(): Promise<void>
    permission: boolean
  }
}

/**
 * OneSignal — LCP/INP sonrası, idle + ilk etkileşimde yükle.
 */
export function OneSignalProvider() {
  const [loadSdk, setLoadSdk] = useState(false)

  useEffect(() => {
    const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID
    if (!appId) return

    let cancelled = false
    let idleId: number | null = null
    let timer: ReturnType<typeof setTimeout> | null = null

    const arm = () => {
      if (cancelled) return
      setLoadSdk(true)
      window.OneSignalDeferred = window.OneSignalDeferred || []
      window.OneSignalDeferred.push(async (OneSignal) => {
        await OneSignal.init({
          appId,
          // Unified with public/sw.js (importScripts OneSignal) so PWA
          // installability + push share one controlling worker at `/`.
          serviceWorkerPath: '/sw.js',
          serviceWorkerParam: { scope: '/' },
          notifyButton: { enable: false },
          promptOptions: {
            slidedown: {
              prompts: [
                {
                  type: 'push',
                  autoPrompt: true,
                  delay: {
                    pageViews: 2,
                    timeDelay: 20,
                  },
                  text: {
                    actionMessage: 'Son dakika haberleri için bildirim almak ister misiniz?',
                    acceptButton: 'Evet, bildir',
                    cancelButton: 'Hayır, teşekkürler',
                  },
                },
              ],
            },
          },
        })
      })
    }

    const onInteract = () => {
      arm()
      window.removeEventListener('pointerdown', onInteract)
      window.removeEventListener('keydown', onInteract)
      window.removeEventListener('scroll', onInteract)
    }

    if ('requestIdleCallback' in window) {
      idleId = window.requestIdleCallback(arm, { timeout: 12_000 })
    } else {
      timer = setTimeout(arm, 8_000)
    }

    window.addEventListener('pointerdown', onInteract, { once: true, passive: true })
    window.addEventListener('keydown', onInteract, { once: true })
    window.addEventListener('scroll', onInteract, { once: true, passive: true })

    return () => {
      cancelled = true
      if (idleId != null && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleId)
      }
      if (timer) clearTimeout(timer)
      window.removeEventListener('pointerdown', onInteract)
      window.removeEventListener('keydown', onInteract)
      window.removeEventListener('scroll', onInteract)
    }
  }, [])

  if (!loadSdk) return null

  return (
    <Script
      src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js"
      strategy="lazyOnload"
    />
  )
}
