import Link from 'next/link'
import { formatNewsDateLong } from '@/components/home/desktop/formatNewsDate'
import { EDITION_LABELS, resolveNewspaperEdition } from '@/lib/newspaperEdition'
import { DesktopMarketTicker } from '@/components/home/desktop/DesktopMarketTicker'
import { BrandWordmark } from '@/components/brand/BrandWordmark'
import { ROUTES } from '@/constants/routes'

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
    <div className="nl-masthead" aria-label="Gazete masthead">
      <div className="nl-masthead__meta">
        <p className="m-0 capitalize">{formatNewsDateLong()}</p>
        <div className="flex flex-wrap items-center gap-3">
          <span>Son güncelleme: {updatedLabel}</span>
          <span
            className="nl-masthead__edition"
            aria-label={`Baskı: ${EDITION_LABELS[edition]}`}
          >
            {EDITION_LABELS[edition]}
          </span>
        </div>
      </div>

      <Link href={ROUTES.FEED} className="block no-underline">
        <BrandWordmark
          variant="default"
          size="lg"
          className="nl-masthead__title font-black"
        />
      </Link>
      <p className="mt-1 mb-3 text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-[rgb(var(--color-muted))]">
        Dijital Gazete · Türkiye
      </p>
      <hr className="nl-rule-thick mb-4" />

      <DesktopMarketTicker />
    </div>
  )
}
