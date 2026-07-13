'use client'

import { formatNewsDateLong } from '@/components/home/desktop/formatNewsDate'
import { EDITION_LABELS, resolveNewspaperEdition } from '@/lib/newspaperEdition'
import { DesktopMarketTicker } from '@/components/home/desktop/DesktopMarketTicker'

interface NewspaperMastheadProps {
  lastUpdated?: string
}

export function NewspaperMasthead({ lastUpdated }: NewspaperMastheadProps) {
  const edition = resolveNewspaperEdition()
  const updatedLabel = lastUpdated
    ? new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' }).format(
        new Date(lastUpdated)
      )
    : new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' }).format(new Date())

  return (
    <div aria-label="Gazete masthead">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-[rgb(var(--color-border))] pb-3">
        <p className="m-0 capitalize text-sm text-[rgb(var(--color-muted))]">{formatNewsDateLong()}</p>
        <div className="flex items-center gap-3 text-xs text-[rgb(var(--color-muted))]">
          <span>Son güncelleme: {updatedLabel}</span>
          <span
            className="rounded-full border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-2.5 py-0.5 font-semibold uppercase tracking-wide text-[rgb(var(--color-text))]"
            aria-label={`Baskı: ${EDITION_LABELS[edition]}`}
          >
            {EDITION_LABELS[edition]}
          </span>
        </div>
      </div>
      <DesktopMarketTicker />
    </div>
  )
}
