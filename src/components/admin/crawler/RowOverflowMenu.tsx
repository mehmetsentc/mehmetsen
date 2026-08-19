'use client'

import { useState } from 'react'

export function RowOverflowMenu({ items }: { items: Array<{ label: string; onClick: () => void; danger?: boolean }> }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative inline-block">
      <button type="button" className="rounded px-2 py-1 text-xs" aria-label="Diğer işlemler" onClick={() => setOpen((v) => !v)}>
        ⋯
      </button>
      {open ? (
        <div className="absolute right-0 z-10 mt-1 min-w-[10rem] rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))] py-1 shadow-lg">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              className={`block w-full px-3 py-1.5 text-left text-xs ${item.danger ? 'text-red-600' : ''}`}
              onClick={() => {
                setOpen(false)
                item.onClick()
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
