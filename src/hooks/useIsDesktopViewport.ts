'use client'

import { useSyncExternalStore } from 'react'

const DESKTOP_QUERY = '(min-width: 1024px)'

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(DESKTOP_QUERY)
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

function getSnapshot() {
  return window.matchMedia(DESKTOP_QUERY).matches
}

/**
 * `true` on desktop (>= 1024px), `false` below, `null` during SSR / before
 * hydration. Callers keep their existing (mobile) render for `null` so the
 * mobile surface is unchanged.
 */
export function useIsDesktopViewport(): boolean | null {
  return useSyncExternalStore<boolean | null>(subscribe, getSnapshot, () => null)
}
