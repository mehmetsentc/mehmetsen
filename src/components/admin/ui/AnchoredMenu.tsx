'use client'

/**
 * ADMIN-UX-1 — the one dropdown / popover primitive for the admin.
 *
 * Why: row menus used to be `absolute top-full` inside cards with `overflow-hidden`,
 * so the menu of the LAST row (or any row near the bottom of the screen) was cut off.
 * This renders into document.body with `position: fixed`, opens upwards when there is
 * not enough room below, keeps inside the viewport horizontally, scrolls internally,
 * closes on outside click / Escape, and on phones (< 768 px) becomes a bottom sheet.
 *
 * Do not write new `absolute top-full` menus in the admin — use this component.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

/** Opening down: `top` is set. Opening up: `bottom` (distance from the viewport bottom) so the panel hugs its button whatever its height. */
export type MenuPlacement = { top: number | null; bottom: number | null; left: number; width: number; maxHeight: number; up: boolean }

const MARGIN = 8
const GAP = 4

/** Pure placement maths (exported for tests). */
export function placeMenu(
  rect: { top: number; bottom: number; left: number; right: number },
  viewport: { width: number; height: number },
  want: { width: number; maxHeight: number; align: 'left' | 'right' },
): MenuPlacement {
  const width = Math.min(want.width, viewport.width - MARGIN * 2)
  const below = viewport.height - rect.bottom - MARGIN - GAP
  const above = rect.top - MARGIN - GAP
  const up = below < Math.min(want.maxHeight, 220) && above > below
  const maxHeight = Math.max(120, Math.min(want.maxHeight, up ? above : below))
  const rawLeft = want.align === 'right' ? rect.right - width : rect.left
  const left = Math.max(MARGIN, Math.min(rawLeft, viewport.width - width - MARGIN))
  return up
    ? { top: null, bottom: viewport.height - rect.top + GAP, left, width, maxHeight, up }
    : { top: rect.bottom + GAP, bottom: null, left, width, maxHeight, up }
}

function usePhone(): boolean {
  const [phone, setPhone] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(max-width: 767px)')
    const on = () => setPhone(mq.matches)
    on()
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])
  return phone
}

export function AnchoredMenu({
  anchorRef,
  open,
  onClose,
  width = 224,
  maxHeight = 360,
  align = 'right',
  title,
  role = 'menu',
  className,
  sheetOnPhone = true,
  children,
}: {
  anchorRef: React.RefObject<HTMLElement | null>
  open: boolean
  onClose: () => void
  width?: number
  maxHeight?: number
  align?: 'left' | 'right'
  /** Shown as the bottom-sheet heading on phones. */
  title?: string
  role?: 'menu' | 'dialog' | 'listbox'
  className?: string
  sheetOnPhone?: boolean
  children: React.ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<MenuPlacement | null>(null)
  const phone = usePhone()
  const asSheet = sheetOnPhone && phone

  const update = useCallback(() => {
    const a = anchorRef.current
    if (!a) return
    const r = a.getBoundingClientRect()
    setPos(placeMenu(r, { width: window.innerWidth, height: window.innerHeight }, { width, maxHeight, align }))
  }, [anchorRef, width, maxHeight, align])

  useLayoutEffect(() => {
    if (!open || asSheet) return
    update()
    const on = () => update()
    window.addEventListener('scroll', on, true)
    window.addEventListener('resize', on)
    return () => {
      window.removeEventListener('scroll', on, true)
      window.removeEventListener('resize', on)
    }
  }, [open, asSheet, update])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node
      if (panelRef.current?.contains(t) || anchorRef.current?.contains(t)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        anchorRef.current?.focus?.()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown, { passive: true })
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose, anchorRef])

  if (!open || typeof document === 'undefined') return null

  if (asSheet) {
    return createPortal(
      <div className="fixed inset-0 z-[9998]" data-admin-sheet="">
        <button type="button" aria-label="Kapat" className="absolute inset-0 bg-black/40" onClick={onClose} />
        <div
          ref={panelRef}
          role={role}
          aria-label={title}
          className={cn(
            'absolute inset-x-0 bottom-0 max-h-[80dvh] overflow-y-auto rounded-t-2xl border-t border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-3 shadow-2xl',
            'pb-[calc(env(safe-area-inset-bottom)+12px)]',
            className,
          )}
        >
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-[rgb(var(--color-border))]" aria-hidden="true" />
          {title ? <p className="mb-2 px-1 text-sm font-semibold text-[rgb(var(--color-text))]">{title}</p> : null}
          {children}
        </div>
      </div>,
      document.body,
    )
  }

  if (!pos) return null
  return createPortal(
    <div
      ref={panelRef}
      role={role}
      aria-label={title}
      data-placement={pos.up ? 'top' : 'bottom'}
      style={{ position: 'fixed', ...(pos.up ? { bottom: pos.bottom ?? 0 } : { top: pos.top ?? 0 }), left: pos.left, width: pos.width, maxHeight: pos.maxHeight, zIndex: 9999 }}
      className={cn(
        'overflow-y-auto overscroll-contain rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-1.5 shadow-xl',
        className,
      )}
    >
      {children}
    </div>,
    document.body,
  )
}
