'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell, CheckCheck, X } from 'lucide-react'
import { useNotifications } from '@/hooks/useNotifications'
import { usePlatformLayout } from '@/hooks/usePlatformLayout'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/lib/utils'
import { NotificationsContent } from './NotificationsContent'

interface NotificationBellProps {
  variant?: 'onBrand' | 'default'
  iconClassName?: string
  buttonClassName?: string
}

function NotificationsPanelFooter({ onClose }: { onClose: () => void }) {
  return (
    <div className="border-t border-[rgb(var(--color-border))] px-4 py-2.5">
      <Link
        href={ROUTES.NOTIFICATIONS}
        onClick={onClose}
        className="text-xs font-semibold text-[rgb(var(--color-brand))] hover:underline"
      >
        Tüm bildirimleri gör →
      </Link>
    </div>
  )
}

export function NotificationBell({
  variant = 'onBrand',
  iconClassName,
  buttonClassName,
}: NotificationBellProps) {
  const [open, setOpen] = useState(false)
  const { unreadCount, markAllAsRead, notifications } = useNotifications()
  const { isDesktop } = usePlatformLayout()
  const pathname = usePathname()
  const rootRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => setOpen(false), [])
  const toggle = useCallback(() => setOpen((v) => !v), [])

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!open || !isDesktop) return

    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return
      setOpen(false)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, isDesktop])

  useEffect(() => {
    if (!open || isDesktop) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open, isDesktop])

  const iconCls =
    iconClassName ?? (variant === 'onBrand' ? 'h-[22px] w-[22px]' : 'h-5 w-5')
  const btnCls =
    buttonClassName ??
    cn(
      'relative flex h-11 w-11 items-center justify-center',
      variant === 'onBrand' ? 'text-white' : 'text-[rgb(var(--color-text))]'
    )

  const badge =
    unreadCount > 0 ? (
      <span
        className={cn(
          'absolute rounded-full bg-red-500',
          variant === 'onBrand'
            ? 'right-2 top-2 h-2 w-2 ring-2 ring-[rgb(var(--header-brand-bg))]'
            : 'right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center px-1 text-[10px] font-bold text-white'
        )}
        aria-hidden
      >
        {variant === 'onBrand' ? null : unreadCount > 9 ? '9+' : unreadCount}
      </span>
    ) : null

  const mobileSheet =
    open && !isDesktop && typeof document !== 'undefined'
      ? createPortal(
          <div className="fixed inset-0 z-[110] flex flex-col bg-[rgb(var(--color-surface))] lg:hidden">
            <div
              className="flex items-center gap-2 border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2"
              style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
            >
              <Bell className="ml-1 h-5 w-5 text-[rgb(var(--color-brand))]" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-[rgb(var(--color-text))]">Bildirimler</p>
                <p className="text-[11px] text-[rgb(var(--color-muted))]">
                  {unreadCount > 0
                    ? `${unreadCount > 99 ? '99+' : unreadCount} okunmamış`
                    : 'Etkileşimleriniz'}
                </p>
              </div>
              {notifications.some((n) => !n.read) ? (
                <button
                  type="button"
                  onClick={() => markAllAsRead()}
                  className="flex h-10 items-center gap-1 rounded-lg px-2 text-xs font-medium text-blue-600"
                  aria-label="Tümünü okundu işaretle"
                >
                  <CheckCheck className="h-4 w-4" />
                </button>
              ) : null}
              <button
                type="button"
                onClick={close}
                className="flex h-11 w-11 items-center justify-center rounded-xl"
                aria-label="Kapat"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div
              className="flex min-h-0 flex-1 flex-col px-3 py-3"
              style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
            >
              <NotificationsContent compact onNavigate={close} />
              <NotificationsPanelFooter onClose={close} />
            </div>
          </div>,
          document.body
        )
      : null

  return (
    <>
      <div ref={rootRef} className="relative">
        <button
          type="button"
          onClick={toggle}
          className={btnCls}
          aria-label="Bildirimler"
          aria-expanded={open}
          aria-haspopup="dialog"
        >
          <Bell className={iconCls} strokeWidth={2} />
          {badge}
        </button>

        {open && isDesktop ? (
          <div
            role="dialog"
            aria-label="Bildirimler"
            className="absolute right-0 top-full z-50 mt-2 flex w-[min(calc(100vw-1rem),380px)] flex-col overflow-hidden rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-[rgb(var(--color-border))] px-4 py-3">
              <span className="text-sm font-bold text-[rgb(var(--color-text))]">Bildirimler</span>
              {notifications.some((n) => !n.read) ? (
                <button
                  type="button"
                  onClick={() => markAllAsRead()}
                  className="flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Okundu
                </button>
              ) : null}
            </div>

            <div className="max-h-[min(70vh,520px)] overflow-y-auto px-3 py-3">
              <NotificationsContent compact onNavigate={close} />
            </div>

            <NotificationsPanelFooter onClose={close} />
          </div>
        ) : null}
      </div>

      {mobileSheet}
    </>
  )
}
