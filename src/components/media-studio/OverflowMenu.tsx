'use client'

import { useRef, useState } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { AnchoredMenu } from '@/components/admin/ui/AnchoredMenu'
import { focusRing } from './styles'

export const overflowItemClass = `flex w-full items-center rounded-lg px-3 py-2 text-left text-sm font-medium text-[rgb(var(--color-text))] hover:bg-[rgb(var(--color-surface))] ${focusRing}`

/** ADMIN-UX-1: portal menu (never clipped by the card / last row), bottom sheet on phones. */
export function OverflowMenu({ label = 'Diğer işlemler', children }: { label?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)

  return (
    <div className="relative shrink-0">
      <button
        ref={btn}
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={label}
        className={`flex h-8 w-8 items-center justify-center rounded-lg text-[rgb(var(--color-muted))] hover:bg-[rgb(var(--color-surface))] hover:text-[rgb(var(--color-text))] max-md:h-11 max-md:w-11 ${focusRing}`}
        onClick={() => setOpen((value) => !value)}
      >
        <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
      </button>
      <AnchoredMenu anchorRef={btn} open={open} onClose={() => setOpen(false)} width={208} title={label} className="p-1">
        <div onClick={() => setOpen(false)}>{children}</div>
      </AnchoredMenu>
    </div>
  )
}
