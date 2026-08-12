'use client'

/**
 * CityStaticLayout
 *
 * Hafif sarmalayıcı — (main) route group içindeki sayfalar city subdomain'de
 * açıldığında CityLayoutClient kullanılamaz (kategoriler yüklenmez, context yok).
 * Bu bileşen sadece CityNavbar + CityFooter + CityCategoryProvider (boş liste)
 * sarar; sidebar/pull-to-refresh vs. eklenmez.
 */

import { CityCategoryProvider } from '@/store/cityCategoryContext'
import { CityNavbar } from './CityNavbar'
import { CityFooter } from './CityFooter'

interface CityStaticLayoutProps {
  cityName: string
  provinceSlug: string
  children: React.ReactNode
}

export function CityStaticLayout({ cityName, provinceSlug, children }: CityStaticLayoutProps) {
  return (
    <CityCategoryProvider categories={[]}>
      <div className="min-h-screen bg-[rgb(var(--color-surface))]">
        {/* Navbar — onMenuClick verilmez, menü butonu pasif kalır */}
        <CityNavbar cityName={cityName} provinceSlug={provinceSlug} />

        {/* İçerik + footer */}
        <div className="content-stage content-stage-newspaper">
          <main
            id="main-content"
            tabIndex={-1}
            className="content-main content-main-newspaper desktop-newspaper"
          >
            {children}
          </main>

          <div className="content-main content-main-newspaper desktop-newspaper pb-6">
            {/* Kategoriler boş → sadece Kurumsal + Hesap sütunları görünür */}
            <CityFooter cityName={cityName} provinceSlug={provinceSlug} />
          </div>
        </div>
      </div>
    </CityCategoryProvider>
  )
}
