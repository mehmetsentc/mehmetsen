'use client'

import * as React from 'react'
import { Toaster, toast as sonnerToast, type ExternalToast } from 'sonner'
import { useTheme } from '@/store/themeContext'

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
    <Toaster
      position="top-center"
      richColors
      closeButton
      theme={resolvedTheme === 'light' ? 'light' : 'dark'}
      offset={16}
      duration={4000}
      toastOptions={{
        classNames: {
          toast:
            'rounded-2xl border border-border bg-bg-card text-text-primary shadow-lg backdrop-blur-md',
          title: 'font-semibold tracking-tight',
          description: 'text-text-tertiary text-sm',
          actionButton: 'bg-brand-500 text-white',
          cancelButton: 'bg-bg-subtle text-text-secondary',
          closeButton: 'text-text-tertiary hover:text-text-primary',
        },
      }}
    />
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
