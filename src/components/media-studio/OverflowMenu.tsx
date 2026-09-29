'use client'

import { useEffect, useRef, useState } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { focusRing } from './styles'

export const overflowItemClass = `flex w-full items-center rounded-lg px-3 py-2 text-left text-sm font-medium text-[rgb(var(--color-text))] hover:bg-[rgb(var(--color-surface))] ${focusRing}`

export function OverflowMenu({ label = 'Diğer işlemler', children }: { label?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={label}
        className={`flex h-8 w-8 items-center justify-center rounded-lg text-[rgb(var(--color-muted))] hover:bg-[rgb(var(--color-surface))] hover:text-[rgb(var(--color-text))] ${focusRing}`}
        onClick={() => setOpen((value) => !value)}
      >
        <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 min-w-44 rounded-xl bg-[rgb(var(--color-card))] p-1 shadow-[0_8px_24px_rgba(0,0,0,0.12)] ring-1 ring-[rgb(var(--color-border))]"
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      ) : null}
    </div>
  )
}
