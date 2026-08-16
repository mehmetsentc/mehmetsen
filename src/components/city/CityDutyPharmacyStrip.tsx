'use client'

import Link from 'next/link'
import { Pill } from 'lucide-react'
import { ROUTES } from '@/constants/routes'
import { DutyPharmacyGroupList } from '@/components/city/DutyPharmacyGroupList'
import type { DutyPharmacyGroup } from '@/types/dutyPharmacy'

interface CityDutyPharmacyStripProps {
  districtName: string
  districtSlug: string
  groups: DutyPharmacyGroup[]
}

export function CityDutyPharmacyStrip({
  districtName,
  districtSlug,
  groups,
}: CityDutyPharmacyStripProps) {
  const count = groups.reduce((sum, group) => sum + group.pharmacies.length, 0)
  if (count === 0) return null

  return (
    <section className="mx-auto w-full max-w-3xl px-4 pb-6 lg:max-w-6xl">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[rgb(var(--color-brand))]/10">
            <Pill className="h-4 w-4 text-[rgb(var(--color-brand))]" />
          </span>
          <div>
            <h2 className="text-base font-black text-[rgb(var(--color-text))]">
              {districtName} nöbetçi eczaneler
            </h2>
            <p className="text-xs text-[rgb(var(--color-text-secondary))]">
              Bugün {count} eczane
            </p>
          </div>
        </div>
        <Link
          href={ROUTES.CITY_DUTY_PHARMACIES_DISTRICT(districtSlug)}
          className="text-xs font-semibold text-[rgb(var(--color-brand))] underline-offset-2 hover:underline"
        >
          Tüm liste
        </Link>
      </div>
      <DutyPharmacyGroupList groups={groups} />
    </section>
  )
}
