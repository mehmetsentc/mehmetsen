'use client'

import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export type InterestOption = {
  id: string
  label: string
}

const BACKGROUNDS: Record<string, string> = {
  gundem: 'linear-gradient(160deg,#7f1d1d,#111827)',
  siyaset: 'linear-gradient(160deg,#312e81,#111827)',
  ekonomi: 'linear-gradient(160deg,#064e3b,#111827)',
  dunya: 'linear-gradient(160deg,#1e3a8a,#111827)',
  teknoloji: 'linear-gradient(160deg,#155e75,#111827)',
  saglik: 'linear-gradient(160deg,#9f1239,#111827)',
  bilim: 'linear-gradient(160deg,#0f766e,#111827)',
  spor: 'linear-gradient(160deg,#7c2d12,#111827)',
  magazin: 'linear-gradient(160deg,#831843,#111827)',
  kultur: 'linear-gradient(160deg,#6b21a8,#111827)',
  gastronomi: 'linear-gradient(160deg,#854d0e,#111827)',
  otomobil: 'linear-gradient(160deg,#1f2937,#111827)',
  'yerel-haber': 'linear-gradient(160deg,#166534,#111827)',
}

export function InterestPicker({
  options,
  selected,
  onToggle,
}: {
  options: InterestOption[]
  selected: string[]
  onToggle: (id: string) => void
}) {
  return (
    <div className="nah-interest-grid" data-testid="interest-picker">
      {options.map((option) => {
        const active = selected.includes(option.id)
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onToggle(option.id)}
            className={cn('nah-interest-card', active && 'is-selected')}
            aria-pressed={active}
          >
            <span
              className="absolute inset-0"
              style={{ background: BACKGROUNDS[option.id] ?? 'linear-gradient(160deg,#1f2937,#111827)' }}
              aria-hidden
            />
            <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
            {active ? (
              <span className="nah-interest-card__check" aria-hidden>
                <Check className="h-3 w-3" />
              </span>
            ) : null}
            <span className="absolute inset-x-2 bottom-2 text-left text-[12px] font-extrabold leading-tight text-white">
              {option.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
