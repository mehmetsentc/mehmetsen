'use client'

import { useMemo, useState } from 'react'
import { LocateFixed, Loader2, MapPin, Navigation, Phone } from 'lucide-react'
import {
  directionsUrl,
  distanceKm,
  formatDistance,
  hasCoords,
  isOnDutyNow,
  mapEmbedUrl,
  type LatLng,
} from '@/lib/cityServices/geo'
import { cn } from '@/lib/utils'
import type { DutyPharmacy, DutyPharmacyGroup } from '@/types/dutyPharmacy'
import { PharmacyMark } from './PharmacyMark'
import type { LocationStatus } from './useUserLocation'

export type RankedPharmacy = DutyPharmacy & { district: string; km: number | null }

export function rankPharmacies(groups: DutyPharmacyGroup[], position: LatLng | null): RankedPharmacy[] {
  const rows: RankedPharmacy[] = groups.flatMap((g) =>
    g.pharmacies.map((p) => ({
      ...p,
      district: g.district,
      km: position && hasCoords(p) ? distanceKm(position, p) : null,
    }))
  )
  if (!position) return rows
  return rows.sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity))
}

interface Props {
  groups: DutyPharmacyGroup[]
  status: LocationStatus
  position: LatLng | null
  onLocate: () => void
  /** List is from an earlier day — never claim «şu an nöbette». */
  stale: boolean
}

/**
 * CITY-SERVICES-1 — «Sana en yakın»: location banner with a pulsing pin, swipeable
 * nearest-pharmacy cards (red «E» sign, distance, live duty badge, Ara / Yol tarifi)
 * and a small map of the selected pharmacy.
 */
export function CityNearestPharmacies({ groups, status, position, onLocate, stale }: Props) {
  const nearest = useMemo(
    () => rankPharmacies(groups, position).filter((p) => p.km != null).slice(0, 8),
    [groups, position]
  )
  const [selected, setSelected] = useState(0)
  const active = nearest[Math.min(selected, Math.max(0, nearest.length - 1))]
  const now = new Date()

  if (status !== 'ready' || !position) {
    return (
      <section className="mb-5 overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-gradient-to-br from-red-500/10 via-[rgb(var(--color-card))] to-[rgb(var(--color-card))] p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="relative flex h-11 w-11 shrink-0 items-center justify-center">
            <span className="absolute inset-0 animate-ping rounded-full bg-red-500/30 motion-reduce:animate-none" />
            <span className="relative flex h-11 w-11 items-center justify-center rounded-full bg-red-600 text-white shadow">
              <MapPin className="h-5 w-5" />
            </span>
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-[rgb(var(--color-text))]">Sana en yakın nöbetçi eczane</p>
            <p className="mt-0.5 text-xs leading-snug text-[rgb(var(--color-text-secondary))]">
              {status === 'denied'
                ? 'Konum izni kapalı. Tarayıcı ayarlarından izin verirsen en yakını üstte gösteririz.'
                : status === 'unavailable'
                  ? 'Konumun alınamadı. Aşağıdan ilçeni seçebilirsin.'
                  : 'Konumunu paylaş, nöbetçi eczaneleri yakından uzağa sıralayalım. Konum cihazında kalır.'}
            </p>
          </div>
        </div>
        {status !== 'denied' ? (
          <button
            type="button"
            onClick={onLocate}
            disabled={status === 'locating'}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 py-2.5 text-sm font-bold text-white shadow-sm transition active:scale-[0.99] disabled:opacity-80"
          >
            {status === 'locating' ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
            {status === 'locating' ? 'Konum alınıyor…' : 'Konumuma göre sırala'}
          </button>
        ) : null}
      </section>
    )
  }

  if (nearest.length === 0) return null

  return (
    <section className="mb-6" aria-label="Sana en yakın nöbetçi eczaneler">
      <div className="mb-2 flex items-end justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-black text-[rgb(var(--color-text))]">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:animate-none" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
          Sana en yakın
        </h2>
        <span className="text-[11px] font-semibold text-[rgb(var(--color-muted))]">Kaydır →</span>
      </div>

      <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 scrollbar-hide">
        {nearest.map((p, i) => {
          const live = !stale && isOnDutyNow(p, now)
          const dir = directionsUrl(p)
          return (
            <li key={`${p.district}-${p.name}-${p.phone}`} className="w-[78%] max-w-[300px] shrink-0 snap-start">
              <article
                onClick={() => setSelected(i)}
                className={cn(
                  'flex h-full cursor-pointer flex-col rounded-2xl border bg-[rgb(var(--color-card))] p-3.5 shadow-sm transition-colors',
                  i === selected ? 'border-red-500/70 ring-1 ring-red-500/40' : 'border-[rgb(var(--color-border))]'
                )}
              >
                <div className="flex items-start gap-3">
                  <PharmacyMark size={42} live={live} />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[15px] font-black leading-tight text-[rgb(var(--color-text))]">{p.name}</h3>
                    <p className="mt-0.5 text-xs text-[rgb(var(--color-text-secondary))]">{p.district}</p>
                  </div>
                  {p.km != null ? (
                    <span className="shrink-0 rounded-full bg-[rgb(var(--color-surface-raised))] px-2 py-1 text-xs font-black tabular-nums text-[rgb(var(--color-text))]">
                      {formatDistance(p.km)}
                    </span>
                  ) : null}
                </div>
                {live ? (
                  <p className="mt-2 inline-flex w-fit items-center gap-1.5 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-300">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                    Şu an nöbette
                  </p>
                ) : null}
                {p.address ? (
                  <p className="mt-2 line-clamp-2 text-xs leading-snug text-[rgb(var(--color-text-secondary))]">{p.address}</p>
                ) : null}
                <div className="mt-auto flex gap-2 pt-3">
                  {p.phoneHref ? (
                    <a
                      href={p.phoneHref}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-red-600 py-2 text-xs font-bold text-white"
                    >
                      <Phone className="h-3.5 w-3.5" /> Ara
                    </a>
                  ) : null}
                  {dir ? (
                    <a
                      href={dir}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-[rgb(var(--color-border))] py-2 text-xs font-bold text-[rgb(var(--color-text))]"
                    >
                      <Navigation className="h-3.5 w-3.5" /> Yol tarifi
                    </a>
                  ) : null}
                </div>
              </article>
            </li>
          )
        })}
      </ul>

      {active && hasCoords(active) ? (
        <div className="mt-2 overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface-raised))]">
          <iframe
            key={`${active.lat},${active.lng}`}
            title={`${active.name} harita`}
            src={mapEmbedUrl(active)}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            className="block h-40 w-full border-0"
          />
          <p className="flex items-center gap-1.5 px-3 py-2 text-[11px] text-[rgb(var(--color-text-secondary))]">
            <MapPin className="h-3.5 w-3.5 text-red-500" />
            <span className="truncate">
              {active.name}
              {active.km != null ? ` · ${formatDistance(active.km)} uzakta` : ''}
            </span>
          </p>
        </div>
      ) : null}
    </section>
  )
}
