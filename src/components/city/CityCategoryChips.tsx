'use client'

import { useRef, useEffect } from 'react'
import { CITY_CATEGORY_CHIPS } from '@/constants/cityCategories'
import { cn } from '@/lib/utils'

interface CityCategoryChipsProps {
  activeId: string
  onSelect: (chipId: string, categoryId: string | null) => void
}

export function CityCategoryChips({ activeId, onSelect }: CityCategoryChipsProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (activeRef.current && scrollRef.current) {
      activeRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      })
    }
  }, [activeId])

  return (
    <div
      ref={scrollRef}
      className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide"
    >
      {CITY_CATEGORY_CHIPS.map((chip) => {
        const isActive = chip.id === activeId
        return (
          <button
            key={chip.id}
            ref={isActive ? activeRef : undefined}
            type="button"
            onClick={() => onSelect(chip.id, chip.categoryId)}
            className={cn(
              'shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-[rgb(var(--color-brand))] text-white'
                : 'bg-[rgb(var(--color-surface-raised))] text-[rgb(var(--color-text-secondary))] hover:bg-[rgb(var(--color-surface-raised-hover))]'
            )}
          >
            {chip.label}
          </button>
        )
      })}
    </div>
  )
}
