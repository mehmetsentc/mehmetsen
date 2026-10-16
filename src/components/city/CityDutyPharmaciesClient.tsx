'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Pill, Search } from 'lucide-react'
import {
  dutyPharmacyDistrictChips,
  filterDutyPharmacyGroups,
} from '@/lib/dutyPharmacies/officialDistrict'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/lib/utils'
import { DutyPharmacyGroupList, pharmacyKey } from '@/components/city/DutyPharmacyGroupList'
import { CityNearestPharmacies } from '@/components/city/CityNearestPharmacies'
import { useUserLocation } from '@/components/city/useUserLocation'
import { distanceKm, hasCoords, isDutyListStale } from '@/lib/cityServices/geo'
import type { DutyPharmacySnapshot } from '@/types/dutyPharmacy'

interface CityDutyPharmaciesClientProps {
  cityName: string
  snapshot: DutyPharmacySnapshot | null
  /** Official ilçe slug — when set, only that district's pharmacies are listed. */
  districtSlug?: string | null
  districtName?: string | null
}

function formatDutyDate(isoDate: string | null): string | null {
  if (!isoDate) return null
  const d = new Date(`${isoDate}T12:00:00+03:00`)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Istanbul',
  })
}

function formatFetchedAt(iso: string | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Istanbul',
  })
}

export function CityDutyPharmaciesClient({
  cityName,
  snapshot,
  districtSlug = null,
  districtName = null,
}: CityDutyPharmaciesClientProps) {
  const [query, setQuery] = useState('')
  const { status: locStatus, position, locate } = useUserLocation()
  const stale = useMemo(() => isDutyListStale(snapshot), [snapshot])

  const groups = snapshot?.groups ?? []
  const citySlug = snapshot?.citySlug ?? ''
  const sourceUrl = snapshot?.sourceUrl ?? '#'
  const sourceLabel = snapshot?.sourceLabel ?? 'İl Eczacı Odası'
  const chips = useMemo(
    () => (citySlug ? dutyPharmacyDistrictChips(groups, citySlug) : []),
    [groups, citySlug]
  )
  const districtGroups = useMemo(
    () =>
      citySlug ? filterDutyPharmacyGroups(groups, districtSlug, citySlug) : groups,
    [groups, districtSlug, citySlug]
  )
  const q = query.trim().toLocaleLowerCase('tr-TR')

  const filteredGroups = useMemo(() => {
    return districtGroups
      .map((group) => ({
        ...group,
        pharmacies: group.pharmacies.filter((pharmacy) => {
          if (!q) return true
          const hay = [pharmacy.name, pharmacy.address, pharmacy.phone, group.district]
            .join(' ')
            .toLocaleLowerCase('tr-TR')
          return hay.includes(q)
        }),
      }))
      .filter((group) => group.pharmacies.length > 0)
  }, [districtGroups, q])

  /** km per pharmacy once the visitor shared a position. */
  const distances = useMemo(() => {
    const m = new Map<string, number>()
    if (!position) return m
    for (const g of groups)
      for (const p of g.pharmacies) if (hasCoords(p)) m.set(pharmacyKey(p), distanceKm(position, p))
    return m
  }, [groups, position])

  /** With a position: nearest district first, nearest pharmacy first inside it. */
  const orderedGroups = useMemo(() => {
    if (distances.size === 0) return filteredGroups
    const km = (p: { name: string; phone: string }) => distances.get(pharmacyKey(p)) ?? Infinity
    return filteredGroups
      .map((g) => ({ ...g, pharmacies: [...g.pharmacies].sort((a, b) => km(a) - km(b)) }))
      .sort((a, b) => km(a.pharmacies[0]!) - km(b.pharmacies[0]!))
  }, [filteredGroups, distances])

  const visibleCount = filteredGroups.reduce(
    (sum, group) => sum + group.pharmacies.length,
    0
  )
  const districtCount = districtGroups.reduce(
    (sum, group) => sum + group.pharmacies.length,
    0
  )
  const dutyDateLabel = formatDutyDate(snapshot?.dutyDate ?? null)
  const fetchedLabel = formatFetchedAt(snapshot?.fetchedAt)
  const titleDistrict = districtName || cityName

  return (
    <div className="w-full pb-8 pt-3 max-md:pt-2">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[rgb(var(--color-brand))]/10">
              <Pill className="h-5 w-5 text-[rgb(var(--color-brand))]" />
            </span>
            <div>
              <h1 className="text-lg font-black tracking-tight text-[rgb(var(--color-text))] md:text-xl xl:text-2xl">
                {titleDistrict} Nöbetçi Eczaneler
              </h1>
              <p className="mt-0.5 text-xs text-[rgb(var(--color-text-secondary))] md:text-sm">
                {dutyDateLabel
                  ? `${dutyDateLabel} nöbet listesi`
                  : 'Günlük nöbetçi eczane listesi'}
                {snapshot
                  ? ` · ${districtSlug ? districtCount : snapshot.pharmacyCount} eczane`
                  : ''}
              </p>
            </div>
          </div>
        </div>
        <p className="text-xs text-[rgb(var(--color-muted))]">
          Kaynak:{' '}
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-[rgb(var(--color-brand))] underline-offset-2 hover:underline"
          >
            {sourceLabel}
          </a>
          {fetchedLabel ? (
            <span className="mt-0.5 block">Son güncelleme: {fetchedLabel}</span>
          ) : null}
        </p>
      </header>

      {stale ? (
        <div
          role="alert"
          className="mb-4 flex items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3.5 text-sm text-[rgb(var(--color-text))]"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <p className="leading-snug">
            <span className="font-bold">Bu liste güncel olmayabilir.</span>{' '}
            {dutyDateLabel ? `${dutyDateLabel} tarihli nöbet listesi gösteriliyor.` : ''} Gitmeden önce
            eczaneyi arayın ya da{' '}
            <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
              {sourceLabel}
            </a>{' '}
            sayfasına bakın.
          </p>
        </div>
      ) : null}

      {groups.length > 0 && !q ? (
        <CityNearestPharmacies
          groups={districtGroups}
          status={locStatus}
          position={position}
          onLocate={locate}
          stale={stale}
        />
      ) : null}

      {groups.length > 0 && (
        <>
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--color-muted))]" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Eczane, adres veya ilçe ara"
              className="w-full rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] py-2.5 pl-10 pr-3 text-sm text-[rgb(var(--color-text))] outline-none ring-[rgb(var(--color-brand))]/30 placeholder:text-[rgb(var(--color-muted))] focus:ring-2"
            />
          </div>

          <div className="mb-5 flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
            <Link prefetch={false}
              href={ROUTES.CITY_DUTY_PHARMACIES}
              className={cn(
                'shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors',
                !districtSlug
                  ? 'bg-[rgb(var(--color-brand))] text-white'
                  : 'bg-[rgb(var(--color-surface-raised))] text-[rgb(var(--color-text-secondary))]'
              )}
            >
              Tümü
            </Link>
            {chips.map((chip) => (
              <Link prefetch={false}
                key={chip.slug}
                href={ROUTES.CITY_DUTY_PHARMACIES_DISTRICT(chip.slug)}
                className={cn(
                  'shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors',
                  districtSlug === chip.slug
                    ? 'bg-[rgb(var(--color-brand))] text-white'
                    : 'bg-[rgb(var(--color-surface-raised))] text-[rgb(var(--color-text-secondary))]'
                )}
              >
                {chip.name}
                <span className="ml-1.5 text-[11px] opacity-80">{chip.count}</span>
              </Link>
            ))}
          </div>
        </>
      )}

      {!snapshot || groups.length === 0 ? (
        <div className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-6 text-sm text-[rgb(var(--color-text-secondary))]">
          Nöbetçi eczane listesi henüz çekilemedi. Kaynak her gün ilgili il eczacı
          odasından güncellenir.
        </div>
      ) : visibleCount === 0 ? (
        <div className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-6 text-sm text-[rgb(var(--color-text-secondary))]">
          {districtName
            ? `${districtName} için bugün listelenen nöbetçi eczane yok.`
            : 'Bu aramaya uyan nöbetçi eczane yok.'}
        </div>
      ) : (
        <DutyPharmacyGroupList groups={orderedGroups} distances={distances} stale={stale} />
      )}
    </div>
  )
}
