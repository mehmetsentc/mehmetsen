import {
  Clock3,
  MapPin,
  Navigation,
  Phone,
} from 'lucide-react'
import { directionsUrl, formatDistance, isOnDutyNow } from '@/lib/cityServices/geo'
import type { DutyPharmacy, DutyPharmacyGroup } from '@/types/dutyPharmacy'
import { PharmacyMark } from './PharmacyMark'

export function pharmacyKey(p: Pick<DutyPharmacy, 'name' | 'phone'>): string {
  return `${p.name}|${p.phone}`
}

function formatDutyHours(pharmacy: DutyPharmacy): string {
  if (pharmacy.dutyStart && pharmacy.dutyEnd) {
    const start = new Date(pharmacy.dutyStart)
    const end = new Date(pharmacy.dutyEnd)
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      const opts: Intl.DateTimeFormatOptions = {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Istanbul',
      }
      return `${start.toLocaleString('tr-TR', opts)} – ${end.toLocaleString('tr-TR', opts)}`
    }
  }
  return pharmacy.dutyLabel.replace(/\s+arasında nöbetçidir\.?$/i, '')
}

export function DutyPharmacyGroupList({
  groups,
  hideGroupHeadings = false,
  distances,
  stale = false,
}: {
  groups: DutyPharmacyGroup[]
  hideGroupHeadings?: boolean
  /** km per pharmacyKey, when the visitor shared a position. */
  distances?: Map<string, number>
  /** Older list — never show «Şu an nöbette». */
  stale?: boolean
}) {
  const now = new Date()
  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <section key={group.districtSlug}>
          {hideGroupHeadings ? null : (
            <h2 className="mb-3 text-sm font-black uppercase tracking-wide text-[rgb(var(--color-text))]">
              {group.district}
              <span className="ml-2 font-semibold normal-case tracking-normal text-[rgb(var(--color-muted))]">
                {group.pharmacies.length} eczane
              </span>
            </h2>
          )}
          <ul className="grid gap-3 md:grid-cols-2">
            {group.pharmacies.map((pharmacy) => {
              const hours = formatDutyHours(pharmacy)
              const km = distances?.get(pharmacyKey(pharmacy))
              const live = !stale && isOnDutyNow(pharmacy, now)
              const dir = directionsUrl(pharmacy)
              return (
              <li
                key={`${group.districtSlug}-${pharmacy.name}-${pharmacy.phone}`}
                className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <PharmacyMark size={36} live={live} />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-bold leading-tight text-[rgb(var(--color-text))]">
                      {pharmacy.name}
                    </h3>
                    {live ? (
                      <span className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-300">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                        Şu an nöbette
                      </span>
                    ) : null}
                  </div>
                  {km != null ? (
                    <span className="shrink-0 rounded-full bg-[rgb(var(--color-surface-raised))] px-2 py-0.5 text-xs font-black tabular-nums text-[rgb(var(--color-text))]">
                      {formatDistance(km)}
                    </span>
                  ) : null}
                </div>
                {pharmacy.address ? (
                  <p className="mt-2 flex items-start gap-2 text-sm text-[rgb(var(--color-text-secondary))]">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--color-brand))]" />
                    <span>{pharmacy.address}</span>
                  </p>
                ) : null}
                {hours ? (
                  <p className="mt-2 flex items-start gap-2 text-sm text-[rgb(var(--color-text-secondary))]">
                    <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--color-brand))]" />
                    <span>{hours}</span>
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {pharmacy.phoneHref ? (
                    <a
                      href={pharmacy.phoneHref}
                      className="inline-flex items-center gap-1.5 rounded-full bg-[rgb(var(--color-brand))] px-3 py-1.5 text-xs font-bold text-white"
                    >
                      <Phone className="h-3.5 w-3.5" />
                      {pharmacy.phone || 'Ara'}
                    </a>
                  ) : null}
                  {dir ? (
                    <a
                      href={dir}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full border border-[rgb(var(--color-border))] px-3 py-1.5 text-xs font-semibold text-[rgb(var(--color-text))]"
                    >
                      <Navigation className="h-3.5 w-3.5" />
                      Yol tarifi
                    </a>
                  ) : null}
                </div>
              </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
