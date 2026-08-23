'use client'

/**
 * NaHaber mobile notification soft-prompt (iOS + Android).
 * Haberler.com-style centered dark modal — NaHaber brand colors only.
 */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'
import { Bell } from 'lucide-react'
import { getConsent, onConsentChange } from '@/lib/consent'
import { isCapacitorNative } from '@/lib/platform'
import {
  detectSoftPromptOs,
  getNotificationPermission,
  markSoftPromptDismissedForVersion,
  markSoftPromptGranted,
  markSoftPromptShownThisSession,
  requestSoftPromptPermission,
  settingsInstructionsForOs,
  shouldShowNotificationsSoftPrompt,
  tryOpenNotificationSettings,
  type SoftPromptPermission,
} from '@/lib/notificationsSoftPrompt'

const SHOW_DELAY_MS = 1_800

function isSoftPromptBlockedPath(pathname: string | null): boolean {
  if (!pathname) return false
  return (
    pathname.startsWith('/admin') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/auth')
  )
}

export function NotificationsSoftPrompt() {
  const pathname = usePathname()
  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [permission, setPermission] = useState<SoftPromptPermission>('default')
  const [showDeniedHint, setShowDeniedHint] = useState(false)
  const titleId = useId()
  const descId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const primaryRef = useRef<HTMLButtonElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  const dismissForVersion = useCallback(() => {
    markSoftPromptDismissedForVersion()
    markSoftPromptShownThisSession()
    setOpen(false)
    setShowDeniedHint(false)
  }, [])

  const trySchedule = useCallback(() => {
    if (typeof window === 'undefined') return
    if (isSoftPromptBlockedPath(pathname)) return
    if (!shouldShowNotificationsSoftPrompt()) return

    // Wait for cookie consent on web so prompts do not stack.
    if (!isCapacitorNative() && getConsent() === null) return

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      if (isSoftPromptBlockedPath(pathname)) return
      if (!shouldShowNotificationsSoftPrompt()) return
      const perm = getNotificationPermission()
      setPermission(perm)
      markSoftPromptShownThisSession()
      setOpen(true)
    }, SHOW_DELAY_MS)
  }, [pathname])

  useEffect(() => {
    if (!mounted) return
    if (isSoftPromptBlockedPath(pathname)) {
      if (timerRef.current) clearTimeout(timerRef.current)
      return
    }
    trySchedule()
    const unsub = onConsentChange(() => {
      trySchedule()
    })
    return () => {
      unsub()
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [mounted, pathname, trySchedule])

  // Body scroll lock + focus trap entry
  useEffect(() => {
    if (!open) return

    previouslyFocused.current = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    const previousTouchAction = document.body.style.touchAction
    document.body.style.overflow = 'hidden'
    document.body.style.touchAction = 'none'

    const focusTimer = window.setTimeout(() => {
      primaryRef.current?.focus()
    }, 50)

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        dismissForVersion()
        return
      }
      if (e.key !== 'Tab' || !dialogRef.current) return
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      clearTimeout(focusTimer)
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      document.body.style.touchAction = previousTouchAction
      previouslyFocused.current?.focus?.()
    }
  }, [open, dismissForVersion])

  const onPrimary = useCallback(async () => {
    if (busy) return
    setBusy(true)
    try {
      const current = getNotificationPermission()
      if (current === 'denied') {
        const opened = await tryOpenNotificationSettings()
        if (!opened) setShowDeniedHint(true)
        setPermission('denied')
        return
      }

      const result = await requestSoftPromptPermission()
      setPermission(result)
      if (result === 'granted') {
        markSoftPromptGranted()
        setOpen(false)
        return
      }
      if (result === 'denied') {
        setShowDeniedHint(true)
        // Persist dismiss for this version so we do not re-spam after deny.
        markSoftPromptDismissedForVersion()
      }
    } finally {
      setBusy(false)
    }
  }, [busy])

  const onDialogKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      dismissForVersion()
    }
  }

  if (!mounted || !open || typeof document === 'undefined') return null

  const os = detectSoftPromptOs()
  const primaryIsSettings = permission === 'denied' || showDeniedHint
  const primaryLabel = primaryIsSettings ? 'Ayarlara Git' : 'İzin Ver'
  const bodyText = primaryIsSettings
    ? settingsInstructionsForOs(os)
    : 'Son dakika haberleri ve öne çıkan gelişmeler için bildirimleri açmanızı öneriyoruz.'

  return createPortal(
    <div
      className="fixed inset-0 z-modal flex items-center justify-center bg-black/60 p-5"
      role="presentation"
      onClick={dismissForVersion}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onDialogKeyDown}
        className="relative w-full max-w-[320px] rounded-[22px] bg-[#1c1c1e] px-6 pb-5 pt-8 text-center shadow-2xl outline-none"
        style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom, 0px))' }}
      >
        <div
          className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[rgb(var(--brand-500))]/15"
          aria-hidden
        >
          <Bell className="h-8 w-8 text-[rgb(var(--brand-500))]" strokeWidth={2.25} />
        </div>

        <h2 id={titleId} className="text-[1.125rem] font-bold leading-snug text-white">
          Haberleri Kaçırmayın!
        </h2>
        <p id={descId} className="mt-2.5 text-[0.9375rem] leading-relaxed text-white/85">
          {bodyText}
        </p>

        <div className="mt-7 grid grid-cols-2 items-center gap-2">
          <button
            type="button"
            onClick={dismissForVersion}
            className="min-h-11 touch-manipulation rounded-xl px-3 py-2.5 text-[0.9375rem] font-medium text-white/70 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
          >
            Daha Sonra
          </button>
          <button
            ref={primaryRef}
            type="button"
            onClick={() => void onPrimary()}
            disabled={busy}
            className="min-h-11 touch-manipulation rounded-xl bg-[rgb(var(--brand-500))] px-3 py-2.5 text-[0.9375rem] font-semibold text-white transition-opacity hover:opacity-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-60"
          >
            {busy ? '…' : primaryLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
