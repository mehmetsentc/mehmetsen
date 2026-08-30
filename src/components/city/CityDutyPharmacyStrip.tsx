'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronRight, Pill } from 'lucide-react'
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
    <section className="mx-auto w-full max-w-3xl px-4 pb-3 lg:max-w-full lg:px-0">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3.5 py-2.5 text-left transition-colors hover:bg-[rgb(var(--color-surface-raised))] active:scale-[0.99]"
      >
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[rgb(var(--color-brand))]/10"
          aria-hidden
        >
          <Pill className="h-4 w-4 text-[rgb(var(--color-brand))]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-bold leading-tight text-[rgb(var(--color-text))]">
            Nöbetçi Eczane
          </span>
          <span className="block text-[11px] text-[rgb(var(--color-muted))]">
            {districtName} · bugün {count} eczane
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-[rgb(var(--color-muted))]" aria-hidden />
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
