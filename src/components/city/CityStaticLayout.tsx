'use client'

/**
 * CityStaticLayout
 *
 * Hafif sarmalayıcı — legacy fallback. Prefer CityLayoutClient in (main)/layout
 * (ScrollHeaderProvider + non-empty category pills). Kept for defensive imports.
 */

import { ScrollHeaderProvider } from '@/context/ScrollHeaderContext'
import { CityCategoryProvider } from '@/store/cityCategoryContext'
import type { CityCategory } from '@/services/cityNewsService.server'
import { CityNavbar } from './CityNavbar'
import { CitySectionNav } from './CitySectionNav'
import { CityFooter } from './CityFooter'

interface CityStaticLayoutProps {
  cityName: string
  provinceSlug: string
  children: React.ReactNode
  categories?: CityCategory[]
  hasSpor?: boolean
}

export function CityStaticLayout({
  cityName,
  provinceSlug,
  children,
  categories = [],
  hasSpor = false,
}: CityStaticLayoutProps) {
  return (
    <ScrollHeaderProvider>
      <CityCategoryProvider categories={categories} hasSpor={hasSpor}>
        <div className="min-h-screen bg-[rgb(var(--color-surface))]">
          <CityNavbar cityName={cityName} provinceSlug={provinceSlug} />
          <CitySectionNav />

          <div className="content-stage content-stage-newspaper">
            <main
              id="main-content"
              tabIndex={-1}
              className="content-main content-main-newspaper desktop-newspaper"
            >
              {children}
            </main>

            <div className="content-main content-main-newspaper desktop-newspaper pb-6">
              <CityFooter cityName={cityName} provinceSlug={provinceSlug} />
            </div>
          </div>
        </div>
      </CityCategoryProvider>
    </ScrollHeaderProvider>
  )
}
