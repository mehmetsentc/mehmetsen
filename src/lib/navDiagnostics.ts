'use client'

const ENABLED = process.env.NEXT_PUBLIC_NAV_DEBUG === '1'

type NavPhase = 'start' | 'complete'

interface NavTiming {
  href: string
  start: number
  from: string
}

const pending = new Map<string, NavTiming>()

function log(phase: NavPhase, href: string, from: string, extra?: Record<string, unknown>) {
  if (!ENABLED || typeof performance === 'undefined') return

  const key = `${from}->${href}`
  const now = performance.now()

  if (phase === 'start') {
    pending.set(key, { href, start: now, from })
    console.info('[nav]', { phase, href, from, t: now.toFixed(1) })
    return
  }

  const entry = pending.get(key)
  const elapsed = entry ? now - entry.start : null
  pending.delete(key)
  console.info('[nav]', { phase, href, from, elapsedMs: elapsed?.toFixed(1), ...extra })
}

export function logNavClick(href: string, from: string) {
  log('start', href, from)
}

export function logRouteChange(pathname: string, search?: string) {
  if (!ENABLED || typeof performance === 'undefined') return

  const full = search ? `${pathname}${search}` : pathname
  const now = performance.now()

  for (const [key, entry] of pending.entries()) {
    if (full === entry.href || full.startsWith(entry.href)) {
      log('complete', entry.href, entry.from, { pathname: full, t: now.toFixed(1) })
      pending.delete(key)
      return
    }
  }

  console.info('[nav]', { phase: 'route', pathname: full, t: now.toFixed(1) })
}
