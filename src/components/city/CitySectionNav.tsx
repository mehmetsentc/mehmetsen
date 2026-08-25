'use client'

/**
 * CitySectionNav — şehir sayfasının haber kategori filtre şeridi.
 *
 * Sadece haber kategorisi chip'leri gösterir (Hepsi + dinamik kategoriler).
 * Sayfa navları (Etkinlik, İş, Eczane, Spor, İlçeler) alt navda (CityMobileNav) zaten var.
 *
 * Aktif chip: marka kırmızısı dolgu + beyaz metin (brand fill).
 * Swipe desteği CityThreadFeed tarafından sağlanır — bu bileşen sadece render.
 */

import { useRef } from 'react'
import { usePathname } from 'next/navigation'
import { useCityCategoryFilter } from '@/store/cityCategoryContext'
import { isCityFeedPath } from '@/lib/cityPaths'
import { cn } from '@/lib/utils'

export function CitySectionNav() {
  const pathname = usePathname()
  const { categories, activeCategoryId, setActiveCategoryId } = useCityCategoryFilter()

  // Sadece feed sayfasında göster, haber detayında gizle
  if (!isCityFeedPath(pathname) || pathname.startsWith('/haber/')) return null

  // Kategoriler yüklenmediyse boş şerit gösterme
  if (categories.length === 0) return null

  const allChips = [
    { id: '__all' as const, label: 'Hepsi' },
    ...categories.map((c) => ({ id: c.id, label: c.name })),
  ]

  return (
    <nav
      className="sticky top-0 z-30 border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))]"
      aria-label="Kategori filtresi"
    >
      <div className="category-nav-scroller flex min-h-[44px] items-center gap-2 overflow-x-auto overscroll-x-contain px-3 py-1.5 scrollbar-hide">
        {allChips.map((chip) => {
          const isActive =
            chip.id === '__all'
              ? activeCategoryId === null
              : activeCategoryId === chip.id

          return (
            <button
              key={chip.id}
              type="button"
              data-category-chip={chip.id}
              onClick={() => setActiveCategoryId(chip.id === '__all' ? null : chip.id)}
              className={cn(
                'shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-all duration-200 touch-manipulation',
                isActive
                  ? 'bg-[rgb(var(--color-brand))] text-white shadow-sm'
                  : 'bg-[rgb(var(--color-surface-raised))] text-[rgb(var(--color-text-secondary))] hover:bg-[rgb(var(--color-border))] hover:text-[rgb(var(--color-text))]'
              )}
            >
              {chip.label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
