'use client'

import { useEffect } from 'react'

/**
 * iOS form-focus zoom guard.
 *
 * iOS WebKit (Safari, Chrome/Firefox on iPhone, home-screen PWA) auto-zooms the
 * page when a text field gets focus, and does NOT zoom back out when the
 * keyboard closes — the page stays enlarged and the right edge (navbar profile
 * button) is cut off. 16px fields avoid most of it, but not every case
 * (field-to-field moves, third-party or future fields).
 *
 * While a text field is being touched/focused on iOS only, this sets the
 * existing viewport tag's maximum-scale to 1. iOS honours maximum-scale for its
 * automatic focus zoom but ignores it for the user's own pinch gesture
 * (accessibility rule since iOS 10), so pinch-zoom keeps working. When focus
 * leaves all text fields, maximum-scale goes back to its original value (5).
 * If a focus-triggered zoom still slipped through (scale was 1 before focus),
 * the restore also brings the page back to scale 1. A zoom the user made
 * themselves before tapping a field is never touched.
 *
 * Android / desktop: no-op (there maximum-scale=1 would block pinch-zoom).
 */

const LOCK_SCALE = '1'

/** Pure: iOS / iPadOS WebKit detection (Chrome & Firefox on iOS are WebKit too). */
export function isIOSUserAgent(ua: string, platform: string, maxTouchPoints: number): boolean {
  if (/iPhone|iPad|iPod/.test(ua)) return true
  // iPadOS 13+ reports a Mac UA; touch points give it away.
  return platform === 'MacIntel' && maxTouchPoints > 1
}

function isIOSWebKit(): boolean {
  if (typeof navigator === 'undefined') return false
  return isIOSUserAgent(navigator.userAgent || '', navigator.platform || '', navigator.maxTouchPoints || 0)
}

/** Pure: viewport content with maximum-scale set to `value` (added if missing). */
export function withMaxScale(content: string, value: string): string {
  return /maximum-scale\s*=\s*[\d.]+/i.test(content)
    ? content.replace(/maximum-scale\s*=\s*[\d.]+/i, `maximum-scale=${value}`)
    : `${content}${content ? ', ' : ''}maximum-scale=${value}`
}

/** Pure: current maximum-scale of a viewport content string (default 5). */
export function maxScaleOf(content: string): string {
  const m = content.match(/maximum-scale\s*=\s*([\d.]+)/i)
  return m ? m[1] : '5'
}

function isTextEntry(el: EventTarget | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true
  if (el instanceof HTMLInputElement) {
    return !/^(checkbox|radio|range|color|file|hidden|button|submit|reset|image)$/.test(el.type)
  }
  return el.isContentEditable
}

function viewportMeta(): HTMLMetaElement | null {
  return document.querySelector('meta[name="viewport"]')
}

function setMaxScale(meta: HTMLMetaElement, value: string): void {
  const content = meta.getAttribute('content') || ''
  const next = withMaxScale(content, value)
  if (next !== content) meta.setAttribute('content', next)
}

function readMaxScale(meta: HTMLMetaElement): string {
  return maxScaleOf(meta.getAttribute('content') || '')
}

export function IosFocusZoomGuard() {
  useEffect(() => {
    if (!isIOSWebKit()) return

    let locked = false
    let original = '5'
    let scaleBeforeFocus = 1
    let releaseTimer = 0

    const lock = () => {
      window.clearTimeout(releaseTimer)
      const meta = viewportMeta()
      if (!meta) return
      if (!locked) {
        original = readMaxScale(meta)
        scaleBeforeFocus = window.visualViewport?.scale ?? 1
        locked = true
      }
      setMaxScale(meta, LOCK_SCALE)
    }

    const release = () => {
      window.clearTimeout(releaseTimer)
      // Field-to-field moves fire focusout then focusin; wait so the lock is
      // not lifted in between (that gap is exactly when iOS would zoom).
      releaseTimer = window.setTimeout(() => {
        if (isTextEntry(document.activeElement)) return
        const meta = viewportMeta()
        locked = false
        if (!meta) return
        const zoomedByFocus =
          scaleBeforeFocus <= 1.01 && (window.visualViewport?.scale ?? 1) > 1.01
        if (zoomedByFocus) {
          // A changed value ("1.0" vs "1") makes WebKit re-read the viewport and
          // snap back to scale 1; then restore the original maximum.
          setMaxScale(meta, '1.0')
          window.setTimeout(() => {
            const m = viewportMeta()
            if (m) setMaxScale(m, original)
          }, 300)
        } else {
          setMaxScale(meta, original)
        }
      }, 250)
    }

    // touchstart fires before iOS focuses the field and decides to zoom.
    const onTouchStart = (e: TouchEvent) => {
      const target = e.target
      const label = target instanceof Element ? target.closest('label') : null
      if (!isTextEntry(target) && !(label && isTextEntry(label.control))) return
      lock()
      // A touch that turns into a scroll never focuses the field: lift the lock.
      window.setTimeout(() => {
        if (locked && !isTextEntry(document.activeElement)) release()
      }, 800)
    }
    const onFocusIn = (e: FocusEvent) => {
      if (isTextEntry(e.target)) lock()
    }
    const onFocusOut = (e: FocusEvent) => {
      if (isTextEntry(e.target)) release()
    }

    document.addEventListener('touchstart', onTouchStart, { capture: true, passive: true })
    document.addEventListener('focusin', onFocusIn, true)
    document.addEventListener('focusout', onFocusOut, true)
    return () => {
      window.clearTimeout(releaseTimer)
      document.removeEventListener('touchstart', onTouchStart, true)
      document.removeEventListener('focusin', onFocusIn, true)
      document.removeEventListener('focusout', onFocusOut, true)
      const meta = viewportMeta()
      if (meta && locked) setMaxScale(meta, original)
    }
  }, [])

  return null
}
