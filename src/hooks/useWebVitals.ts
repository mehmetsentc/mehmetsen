'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

type MetricName = 'FCP' | 'LCP' | 'CLS' | 'TTFB' | 'INP'

interface VitalReport {
  name: MetricName
  value: number
  path: string
}

function sendVital(report: VitalReport) {
  const payload = JSON.stringify(report)
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([payload], { type: 'application/json' })
      if (navigator.sendBeacon('/api/analytics/vitals', blob)) return
    }
  } catch {
    /* fall through */
  }

  fetch('/api/analytics/vitals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: true,
  }).catch(() => {})
}

/** Normalize route path: /haber/xxx → /haber/[slug] */
function normalizePath(path: string): string {
  return path
    .replace(/\/haber\/[^/]+/, '/haber/[slug]')
    .replace(/\/kategori\/[^/]+/, '/kategori/[slug]')
    .replace(/\/etiket\/[^/]+/, '/etiket/[slug]')
    .replace(/\/profil\/[^/]+/, '/profil/[username]')
    .replace(/\/yerel\/[^/]+/, '/yerel/[slug]')
    .split('?')[0]
}

export function useWebVitals() {
  const pathname = usePathname()

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (pathname.startsWith('/admin') || pathname.startsWith('/api')) return
    const path = normalizePath(pathname)
    let reported = false

    // ── TTFB (Time to First Byte) ─────────────────────────────────────────
    try {
      const [nav] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[]
      if (nav) {
        sendVital({ name: 'TTFB', value: Math.round(nav.responseStart - nav.startTime), path })
      }
    } catch {}

    // ── FCP (First Contentful Paint) ──────────────────────────────────────
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name === 'first-contentful-paint') {
            sendVital({ name: 'FCP', value: Math.round(entry.startTime), path })
            observer.disconnect()
          }
        }
      })
      observer.observe({ type: 'paint', buffered: true })
    } catch {}

    // ── LCP (Largest Contentful Paint) ────────────────────────────────────
    let lcpValue = 0
    let lcpObserver: PerformanceObserver | null = null
    try {
      lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries()
        const last = entries[entries.length - 1]
        if (last) lcpValue = Math.round(last.startTime)
      })
      lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true })
    } catch {}

    // ── CLS (Cumulative Layout Shift) ─────────────────────────────────────
    let clsValue = 0
    let clsObserver: PerformanceObserver | null = null
    try {
      clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if (!(entry as any).hadRecentInput) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            clsValue += (entry as any).value ?? 0
          }
        }
      })
      clsObserver.observe({ type: 'layout-shift', buffered: true })
    } catch {}

    // ── INP (Interaction to Next Paint) ───────────────────────────────────
    let inpMax = 0
    let inpObserver: PerformanceObserver | null = null
    try {
      inpObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const duration = (entry as any).duration ?? 0
          if (duration > inpMax) inpMax = duration
        }
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(inpObserver as any).observe({ type: 'event', durationThreshold: 40, buffered: true })
    } catch {}

    // Report LCP + CLS + INP on hide / unload (most accurate timing)
    const flush = () => {
      if (reported) return
      reported = true
      if (lcpValue > 0) sendVital({ name: 'LCP', value: lcpValue, path })
      // Store CLS as integer millis (×1000) to match /api/analytics/vitals bucket logic
      sendVital({ name: 'CLS', value: Math.round(clsValue * 1000), path })
      if (inpMax > 0) sendVital({ name: 'INP', value: Math.round(inpMax), path })
      lcpObserver?.disconnect()
      clsObserver?.disconnect()
      inpObserver?.disconnect()
    }

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', flush)
      lcpObserver?.disconnect()
      clsObserver?.disconnect()
      inpObserver?.disconnect()
    }
  }, [pathname])
}
