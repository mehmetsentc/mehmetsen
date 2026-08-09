'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Search, Bell } from 'lucide-react'
import { BrandWordmark } from '@/components/brand/BrandWordmark'
import { getCityLogoPath } from '@/lib/cityBrand'
import { cn } from '@/lib/utils'

interface CityNavbarProps {
  cityName: string
  provinceSlug: string
}

export function CityNavbar({ cityName, provinceSlug }: CityNavbarProps) {
  const router = useRouter()
  const logoSrc = getCityLogoPath(provinceSlug)

  return (
    <header
      className={cn(
        'sticky top-0 z-40',
        'bg-[rgb(var(--header-brand-bg))] text-white',
        'pt-[env(safe-area-inset-top,0px)]'
      )}
      style={{ height: 'calc(72px + env(safe-area-inset-top, 0px))' }}
    >
      <div className="newspaper-layout-inner flex h-[72px] items-center gap-1">
        <Link href="/" className="flex min-w-0 flex-1 items-center gap-2" aria-label={`${cityName} NaHaber`}>
          {logoSrc ? (
            <Image
              src={logoSrc}
              alt={`${cityName} NaHaber`}
              width={36}
              height={36}
              className="h-9 w-9 rounded-md object-contain"
              priority
            />
          ) : (
            <BrandWordmark variant="onBrand" size="md" className="font-black" />
          )}
          <span className="truncate text-sm font-bold text-white/90">
            {cityName} <span className="text-white/60">NaHaber</span>
          </span>
        </Link>

        <div className="flex shrink-0 items-center">
          <button
            type="button"
            onClick={() => router.push('/search')}
            className="flex h-11 w-11 items-center justify-center text-white"
            aria-label="Ara"
          >
            <Search className="h-[22px] w-[22px]" strokeWidth={2} />
          </button>
          <Link
            href="/notifications"
            className="flex h-11 w-11 items-center justify-center text-white"
            aria-label="Bildirimler"
          >
            <Bell className="h-[22px] w-[22px]" strokeWidth={2} />
          </Link>
        </div>
      </div>
    </header>
  )
}
