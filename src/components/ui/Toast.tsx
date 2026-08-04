'use client'

import * as React from 'react'
import { Toaster, toast as sonnerToast, type ExternalToast } from 'sonner'
import { useTheme } from '@/store/themeContext'

/**
 * Sonner’s default close control sits *outside* the toast via translate(-35%).
 * Our toast classes use `rounded-*` + `backdrop-blur`, which creates a filter
 * containing block that clips overflow hit-testing — the X stays visible but
 * clicks fall through to the page underneath. Keep the control inside the toast.
 */
const CLOSE_BUTTON_INSIDE_STYLE = {
  ['--toast-close-button-start' as string]: 'unset',
  ['--toast-close-button-end' as string]: '6px',
  ['--toast-close-button-transform' as string]: 'translateY(6px)',
} as React.CSSProperties

/**
 * Sonner’s swipe handler only skips when `event.target.tagName === 'BUTTON'`.
 * Clicks on the SVG/line inside the X start swipe + pointer capture, and the
 * button onClick often never fires. Intercept those presses and click the
 * real button instead.
 */
function handleToastPointerDownCapture(event: React.PointerEvent) {
  const target = event.target
  if (!(target instanceof Element)) return
  if (target.tagName === 'BUTTON') return

  const closeBtn = target.closest('[data-close-button]')
  if (!(closeBtn instanceof HTMLButtonElement)) return

  event.stopPropagation()
  event.preventDefault()
  closeBtn.click()
}

/**
 * Toast — NaHaber 2026
 * `sonner` üzerinde ince bir wrapper. NaHaber tasarım dilini taşır
 * (token'lardan renkler + Inter font + Apple-tarzı kayma).
 *
 * Mevcut `react-hot-toast` çağrıları kademeli olarak `toast` API'sine
 * geçirilecek; ikisi bir süre yan yana çalışabilir.
 */
export function ToastViewport() {
  const { resolvedTheme } = useTheme()
  return (
    <div onPointerDownCapture={handleToastPointerDownCapture}>
      <Toaster
        position="top-center"
        richColors
        closeButton
        theme={resolvedTheme === 'light' ? 'light' : 'dark'}
        offset={16}
        duration={4000}
        style={CLOSE_BUTTON_INSIDE_STYLE}
        className="pointer-events-auto"
        toastOptions={{
          classNames: {
            toast:
              'rounded-2xl border border-border bg-bg-card text-text-primary shadow-lg pointer-events-auto',
            title: 'font-semibold tracking-tight',
            description: 'text-text-tertiary text-sm',
            actionButton: 'bg-brand-500 text-white',
            cancelButton: 'bg-bg-subtle text-text-secondary',
            closeButton:
              'pointer-events-auto z-20 text-text-tertiary hover:text-text-primary',
          },
        }}
      />
    </div>
  )
}

interface NaToastOptions {
  description?: React.ReactNode
  action?: { label: string; onClick: () => void }
  cancel?: { label: string; onClick?: () => void }
  duration?: number
  id?: string | number
}

function withCommon(opts?: NaToastOptions): ExternalToast | undefined {
  if (!opts) return undefined
  return {
    id: opts.id,
    duration: opts.duration,
    description: opts.description,
    action: opts.action
      ? { label: opts.action.label, onClick: () => opts.action!.onClick() }
      : undefined,
    cancel: opts.cancel
      ? { label: opts.cancel.label, onClick: () => opts.cancel!.onClick?.() }
      : undefined,
  }
}

export const toast = {
  /** Düz bilgi tostu */
  show: (message: React.ReactNode, opts?: NaToastOptions) =>
    sonnerToast(message as string, withCommon(opts)),
  /** Yeşil — başarı */
  success: (message: React.ReactNode, opts?: NaToastOptions) =>
    sonnerToast.success(message as string, withCommon(opts)),
  /** Sarı — uyarı */
  warning: (message: React.ReactNode, opts?: NaToastOptions) =>
    sonnerToast.warning(message as string, withCommon(opts)),
  /** Kırmızı — hata */
  error: (message: React.ReactNode, opts?: NaToastOptions) =>
    sonnerToast.error(message as string, withCommon(opts)),
  /** Mavi — bilgi */
  info: (message: React.ReactNode, opts?: NaToastOptions) =>
    sonnerToast.info(message as string, withCommon(opts)),
  /** Async işlem — promise hayatı boyunca tost */
  promise: <T,>(
    promise: Promise<T>,
    msgs: { loading: string; success: string | ((d: T) => string); error: string | ((e: unknown) => string) }
  ) => sonnerToast.promise(promise, msgs),
  /** Belli bir id'li tostu kapat */
  dismiss: (id?: string | number) => sonnerToast.dismiss(id),
}
