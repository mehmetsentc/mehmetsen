'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ROUTES } from '@/constants/routes'
import { DutyPharmacyGroupList } from '@/components/city/DutyPharmacyGroupList'
import { Modal } from '@/components/ui/Modal'
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
  const [open, setOpen] = useState(false)
  const count = groups.reduce((sum, group) => sum + group.pharmacies.length, 0)
  if (count === 0) return null

  return (
    <section className="mx-auto w-full max-w-3xl px-4 pb-3 lg:max-w-6xl lg:px-0">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="home-rail-title mb-0 w-full px-0 text-left"
      >
        <span className="home-rail-accent max-md:h-8 max-md:w-[5px]" aria-hidden />
        <span className="text-lg font-black text-[rgb(var(--color-text))] max-md:text-[1.65rem]">
          Nöbetçi Eczane
        </span>
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Nöbetçi Eczane"
        description={`${districtName} · bugün ${count} eczane`}
        size="md"
      >
        <div className="max-h-[min(70vh,32rem)] overflow-y-auto">
          <DutyPharmacyGroupList groups={groups} hideGroupHeadings />
        </div>
        <p className="mt-4 text-right">
          <Link
            href={ROUTES.CITY_DUTY_PHARMACIES_DISTRICT(districtSlug)}
            className="text-xs font-semibold text-[rgb(var(--color-brand))] underline-offset-2 hover:underline"
          >
            Tüm liste
          </Link>
        </p>
      </Modal>
    </section>
  )
}
