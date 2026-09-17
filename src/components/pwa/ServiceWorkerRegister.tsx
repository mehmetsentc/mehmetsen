'use client'

import { useEffect } from 'react'
import { isNativeApp } from '@/lib/platform'

const SW_PATH = '/sw.js'

/**
 * Eagerly register the site service worker so Chromium can fire
 * `beforeinstallprompt` (manifest alone is not enough).
 *
 * Skipped inside Capacitor / Cordova native shells — the App Store app
 * loads https://www.nahaber.com remotely and must not accumulate a PWA
 * SW cache that could delay UI updates after deploy.
 *
 * Safe no-op when SW unsupported (SSR, old browsers, private modes).
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return

    // Dev: never let a stale SW/HMR fight Next chunks (blank page / old bundles).
    if (process.env.NODE_ENV !== 'production') {
      void navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const reg of regs) void reg.unregister()
      })
      if (typeof caches !== 'undefined') {
        void caches.keys().then((keys) => {
          for (const key of keys) void caches.delete(key)
        })
      }
      return
    }

    if (isNativeApp()) return

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
