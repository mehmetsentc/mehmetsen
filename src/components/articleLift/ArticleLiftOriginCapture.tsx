'use client'

import { useEffect } from 'react'
import {
  captureLiftReaderOrigin,
  shouldCaptureLiftReaderOrigin,
} from '@/lib/articleLift/liftOrigin'
import { pinLiftReaderOriginToPageState } from '@/lib/articleLift/liftReaderScroll'

function isModifiedClick(event: MouseEvent): boolean {
  return event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
}

function articleHrefFromEvent(event: Event): string | null {
  const target = event.target
  if (!(target instanceof Element)) return null
  const anchor = target.closest('a[href]')
  if (!(anchor instanceof HTMLAnchorElement)) return null
  const href = anchor.getAttribute('href')
  if (!href) return null
  if (href === '/haber' || href.startsWith('/haber/')) return href
  try {
    const url = new URL(href, window.location.origin)
    if (url.origin !== window.location.origin) return null
    if (url.pathname === '/haber' || url.pathname.startsWith('/haber/')) return url.pathname
  } catch {
    return null
  }
  return null
}

/**
 * Capture reader origin (route + scrollY) in the click capture phase,
 * BEFORE Next.js Link scroll / intercept navigation / PageStateEffects.
 */
export function ArticleLiftOriginCapture() {
  useEffect(() => {
    const onClickCapture = (event: MouseEvent) => {
      if (isModifiedClick(event)) return
      if (!articleHrefFromEvent(event)) return
      const pathname = window.location.pathname
      if (!shouldCaptureLiftReaderOrigin(pathname)) return
      captureLiftReaderOrigin(pathname, window.scrollY)
      pinLiftReaderOriginToPageState()
    }

    document.addEventListener('click', onClickCapture, true)
    return () => document.removeEventListener('click', onClickCapture, true)
  }, [])

  return null
}
