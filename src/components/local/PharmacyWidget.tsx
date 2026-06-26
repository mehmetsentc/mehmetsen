'use client'

/**
 * Nöbetçi eczane widget — eczaneleri.net ücretsiz iframe ile.
 *
 * URL: https://eczaneleri.net/api/new-iframe?type=default-iframe&city={slug}
 * İzin: eczaneleri.net "Sitene Ekle" özelliği ile ücretsiz olarak sunulmaktadır.
 * API key gerekmez, scraping değil.
 */

interface Props {
  citySlug: string
  cityName: string
}

export function PharmacyWidget({ citySlug, cityName }: Props) {
  // eczaneleri.net city parametresi bizim slug'larımızla uyumlu (küçük harf, aksansız)
  const iframeSrc = `https://eczaneleri.net/api/new-iframe?type=default-iframe&city=${encodeURIComponent(citySlug)}`

  return (
    <div className="mt-2 px-3 pb-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-[rgb(var(--color-muted))]">
          {cityName} · Bugünkü nöbetçi eczaneler
        </p>
        <a
          href={`https://eczaneleri.net/nobetci-eczaneler/${citySlug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-[rgb(var(--color-muted))] underline underline-offset-2"
        >
          Tam liste →
        </a>
      </div>

      <div className="rounded-2xl overflow-hidden border border-[rgb(var(--color-border))]">
        <iframe
          key={citySlug}
          src={iframeSrc}
          title={`${cityName} nöbetçi eczaneler`}
          width="100%"
          height="480"
          style={{ border: 'none', display: 'block' }}
          loading="lazy"
          allowFullScreen={false}
        />
      </div>

      <p className="mt-2 text-center text-[10px] text-[rgb(var(--color-muted))]">
        Kaynak: eczaneleri.net
      </p>
    </div>
  )
}
