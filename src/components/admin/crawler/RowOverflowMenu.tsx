'use client'

import { useRef, useState } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { AnchoredMenu } from '@/components/admin/ui/AnchoredMenu'

/** ADMIN-UX-1: portal menu (never clipped by the table / last row), bottom sheet on phones. */
export function RowOverflowMenu({
  items,
}: {
  items: Array<{ label: string; onClick: () => void; danger?: boolean; disabled?: boolean; title?: string }>
}) {
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  return (
    <div className="relative inline-block">
      <button
        ref={btn}
        type="button"
        className="flex h-7 w-7 items-center justify-center rounded-md text-[rgb(var(--color-muted))] hover:bg-[rgb(var(--color-surface))] hover:text-[rgb(var(--color-text))] max-md:h-11 max-md:w-11"
        aria-label="Diğer işlemler"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>
      <AnchoredMenu anchorRef={btn} open={open} onClose={() => setOpen(false)} width={200} title="Diğer işlemler" className="py-1">
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            title={item.title}
            disabled={item.disabled}
            className={`block w-full rounded-md px-3 py-1.5 text-left text-xs hover:bg-[rgb(var(--color-surface))] disabled:cursor-not-allowed disabled:opacity-50 max-md:py-3 max-md:text-sm ${item.danger ? 'text-red-600' : 'text-[rgb(var(--color-text))]'}`}
            onClick={() => {
              if (item.disabled) return
              setOpen(false)
              item.onClick()
            }}
          >
            {item.label}
          </button>
        ))}
      </AnchoredMenu>
    </div>
  )
}
