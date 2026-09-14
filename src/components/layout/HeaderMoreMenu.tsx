'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { Bell, MessageCircle, MoreVertical, Plus, User } from 'lucide-react'
import { ROUTES } from '@/constants/routes'
import { NavMessagesBadge } from '@/components/layout/NavMessagesBadge'
import { useNotifications } from '@/hooks/useNotifications'
import { cn } from '@/lib/utils'

type HeaderMoreMenuProps = {
  profileHref: string
  isProfil: boolean
  isBildirim: boolean
  iconBtnClassName: string
  onSubmitNews: () => void
}

export function HeaderMoreMenu({
  profileHref,
  isProfil,
  isBildirim,
  iconBtnClassName,
  onSubmitNews,
}: HeaderMoreMenuProps) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, right: 8 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const { unreadCount } = useNotifications()

  const close = useCallback(() => setOpen(false), [])

  const syncPos = useCallback(() => {
    const btn = buttonRef.current
    if (!btn) return
    const box = btn.getBoundingClientRect()
    setPos({
      top: Math.round(box.bottom + 6),
      right: Math.max(8, Math.round(window.innerWidth - box.right)),
    })
  }, [])

  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev
      if (next) {
        const btn = buttonRef.current
        if (btn) {
          const box = btn.getBoundingClientRect()
          setPos({
            top: Math.round(box.bottom + 6),
            right: Math.max(8, Math.round(window.innerWidth - box.right)),
          })
        }
      }
      return next
    })
  }, [])

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (buttonRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', syncPos)
    window.addEventListener('scroll', syncPos, true)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', syncPos)
      window.removeEventListener('scroll', syncPos, true)
    }
  }, [open, syncPos])

  const itemClass =
    'flex min-h-11 w-full items-center gap-3 px-3.5 text-left text-[0.9rem] font-medium text-white/92 touch-manipulation'

  const panel =
    open && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={panelRef}
            id={menuId}
            role="menu"
            aria-label="Diğer"
            data-testid="header-more-menu-panel"
            className="header-more-menu__panel"
            style={{ top: pos.top, right: pos.right }}
          >
            <Link
              href={ROUTES.NOTIFICATIONS}
              role="menuitem"
              className={itemClass}
              aria-current={isBildirim ? 'page' : undefined}
              data-testid="header-nav-bildirimler"
              onClick={close}
            >
              <span className="relative flex h-5 w-5 items-center justify-center">
                <Bell className="h-4 w-4" strokeWidth={2.25} />
                {unreadCount > 0 ? (
                  <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-red-500" />
                ) : null}
              </span>
              Bildirimler
            </Link>
            <Link
              href={profileHref}
              role="menuitem"
              className={itemClass}
              aria-current={isProfil ? 'page' : undefined}
              data-testid="header-nav-profil"
              onClick={close}
            >
              <User className="h-4 w-4" strokeWidth={2.25} />
              Profil
            </Link>
            <button
              type="button"
              role="menuitem"
              className={itemClass}
              aria-label="Haber Ekle"
              data-testid="header-action-plus"
              onClick={() => {
                close()
                onSubmitNews()
              }}
            >
              <Plus className="h-4 w-4" strokeWidth={2.25} />
              Haber Ekle
            </button>
            <Link
              href={ROUTES.MESSAGES}
              role="menuitem"
              className={cn(itemClass, 'relative')}
              aria-label="Mesajlar"
              data-testid="header-action-messages"
              onClick={close}
            >
              <span className="relative flex h-5 w-5 items-center justify-center">
                <MessageCircle className="h-4 w-4" strokeWidth={2} />
                <NavMessagesBadge size="sm" />
              </span>
              Mesajlar
            </Link>
          </div>,
          document.body
        )
      : null

  return (
    <div className="header-more-menu" data-testid="header-more-menu">
      <button
        ref={buttonRef}
        type="button"
        className={iconBtnClassName}
        aria-label="Diğer"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        data-testid="header-nav-more"
        onClick={toggle}
      >
        <MoreVertical className="h-5 w-5" strokeWidth={2.25} />
        {unreadCount > 0 ? (
          <span
            className="absolute right-1 top-2 h-1.5 w-1.5 rounded-full bg-red-500"
            aria-hidden
          />
        ) : null}
      </button>
      {panel}
    </div>
  )
}
