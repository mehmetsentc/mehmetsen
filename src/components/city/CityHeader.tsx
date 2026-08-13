'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { BrandWordmark } from '@/components/brand/BrandWordmark'
import { cn } from '@/lib/utils'
import { getCityHeaderLockupPath, getCityLogoPath } from '@/lib/cityBrand'

interface CityHeaderProps {
  cityName: string
  provinceSlug?: string
}

export function CityHeader({ cityName, provinceSlug }: CityHeaderProps) {
  const router = useRouter()
  const lockupSrc = provinceSlug ? getCityHeaderLockupPath(provinceSlug) : null
  const logoSrc = provinceSlug ? getCityLogoPath(provinceSlug) : null

  return (
    <header
      className={cn(
        'sticky top-0 z-40',
        'bg-[rgb(var(--header-brand-bg))] text-white',
        'pt-[env(safe-area-inset-top,0px)]'
      )}
    >
      <div className="flex h-14 items-center gap-1.5 px-3">
        <Link
          href="/"
          className="flex min-w-0 flex-1 items-center gap-2"
          aria-label={`${cityName} NaHaber`}
        >
          {lockupSrc ? (
            <Image
              src={lockupSrc}
              alt={`${cityName} NaHaber`}
              width={420}
              height={36}
              className="h-9 w-auto max-w-full object-contain object-left"
              priority
            />
          ) : logoSrc ? (
            <>
              <Image
                src={logoSrc}
                alt=""
                width={36}
                height={36}
                className="h-9 w-9 shrink-0 rounded-md object-contain"
                priority
              />
              <span className="flex h-9 min-w-0 items-center truncate text-[1.35rem] font-black leading-none tracking-tight">
                <span className="text-white">{cityName}</span>
                <span className="ml-1.5 text-[#E50914]">NaHaber</span>
              </span>
            </>
          ) : (
            <>
              <BrandWordmark variant="onBrand" size="sm" className="font-black text-[1.35rem]" />
              <span className="truncate text-xs font-bold uppercase tracking-wider text-white/80">
                {cityName}
              </span>
            </>
          )}
        </Link>

        <div className="flex shrink-0 items-center">
          <button
            type="button"
            onClick={() => router.push('/search')}
            className="flex h-10 w-10 items-center justify-center text-white"
            aria-label="Ara"
          >
            <Search className="h-5 w-5" strokeWidth={2} />
          </button>
          <NotificationBell
            variant="onBrand"
            iconClassName="h-5 w-5"
            buttonClassName="relative flex h-10 w-10 items-center justify-center text-white"
          />
        </div>
      </div>
    </header>
  )
}
