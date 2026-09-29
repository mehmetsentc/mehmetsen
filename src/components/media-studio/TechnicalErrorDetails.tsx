'use client'

import { useId, useState } from 'react'
import { focusRing } from './styles'

export function TechnicalErrorDetails({ detail }: { detail: string }) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  return (
    <div className="mt-3">
      <button
        type="button"
        className={`text-sm font-semibold text-[rgb(var(--color-text))] underline-offset-4 hover:underline ${focusRing} rounded-md`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        Teknik Detay
      </button>
      {open ? (
        <p
          id={panelId}
          className="mt-2 rounded-xl bg-[rgb(var(--color-surface))] px-3 py-2 text-xs leading-relaxed text-[rgb(var(--color-muted))]"
        >
          {detail}
        </p>
      ) : null}
    </div>
  )
}
