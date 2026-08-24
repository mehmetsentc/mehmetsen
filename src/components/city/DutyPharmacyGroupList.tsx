import {
  Clock3,
  ExternalLink,
  MapPin,
  Phone,
} from 'lucide-react'
import type { DutyPharmacy, DutyPharmacyGroup } from '@/types/dutyPharmacy'

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
}: {
  groups: DutyPharmacyGroup[]
  hideGroupHeadings?: boolean
}) {
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
              return (
              <li
                key={`${group.districtSlug}-${pharmacy.name}-${pharmacy.phone}`}
                className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4 shadow-sm"
              >
                <h3 className="text-base font-bold text-[rgb(var(--color-text))]">
                  {pharmacy.name}
                </h3>
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
                  {pharmacy.mapsUrl ? (
                    <a
                      href={pharmacy.mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full border border-[rgb(var(--color-border))] px-3 py-1.5 text-xs font-semibold text-[rgb(var(--color-text))]"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Harita
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
