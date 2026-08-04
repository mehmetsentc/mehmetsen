'use client'

import { useEffect } from 'react'

const SW_PATH = '/sw.js'

/**
 * Eagerly register the site service worker so Chromium can fire
 * `beforeinstallprompt` (manifest alone is not enough).
 *
 * Safe no-op when SW unsupported (SSR, old browsers, private modes).
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return

    // Already controlling this origin — nothing to do
    const existing = navigator.serviceWorker.controller
    if (existing?.scriptURL?.endsWith(SW_PATH)) return

    const register = () => {
      navigator.serviceWorker.register(SW_PATH, { scope: '/' }).catch(() => {
        /* SW register failures are non-fatal (ad blockers, private mode) */
      })
    }

    // After load so we don't compete with LCP / hydration
    if (document.readyState === 'complete') {
      register()
    } else {
      window.addEventListener('load', register, { once: true })
    }
  }, [])

  return null
}
