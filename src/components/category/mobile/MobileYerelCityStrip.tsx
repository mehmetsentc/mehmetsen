'use client'

import Link from 'next/link'
import { MapPin } from 'lucide-react'
import { ROUTES } from '@/constants/routes'

const QUICK_CITIES = [
  { slug: 'istanbul', name: 'İstanbul' },
  { slug: 'ankara', name: 'Ankara' },
  { slug: 'izmir', name: 'İzmir' },
  { slug: 'bursa', name: 'Bursa' },
  { slug: 'antalya', name: 'Antalya' },
  { slug: 'canakkale', name: 'Çanakkale' },
  { slug: 'adana', name: 'Adana' },
  { slug: 'gaziantep', name: 'Gaziantep' },
] as const

/** Visible city entry points on /kategori/yerel-haber mobile landing. */
export function MobileYerelCityStrip() {
  return (
    <div className="mc-city-strip" aria-label="Şehir seç">
      <Link href={ROUTES.LOCAL} className="mc-city-strip__cta">
        <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
        Şehrini seç
      </Link>
      <div className="mc-city-strip__chips scrollbar-hide" data-no-category-swipe>
        {QUICK_CITIES.map((c) => (
          <Link
            key={c.slug}
            href={ROUTES.LOCAL_CITY(c.slug)}
            className="mc-city-strip__chip"
          >
            {c.name}
          </Link>
        ))}
        <Link href={ROUTES.LOCAL} className="mc-city-strip__chip mc-city-strip__chip--more">
          Tümü
        </Link>
      </div>
    </div>
  )
}
