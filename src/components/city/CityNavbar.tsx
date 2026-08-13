'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Search, Menu, User } from 'lucide-react'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { BrandWordmark } from '@/components/brand/BrandWordmark'
import { useAuth } from '@/hooks/useAuth'
import { ROUTES } from '@/constants/routes'
import { getCityHeaderLockupPath, getCityLogoPath } from '@/lib/cityBrand'
import { cn } from '@/lib/utils'

interface CityNavbarProps {
  cityName: string
  provinceSlug: string
  onMenuClick?: () => void
}

export function CityNavbar({ cityName, provinceSlug, onMenuClick }: CityNavbarProps) {
  const router = useRouter()
  const { user, loading } = useAuth()
  const [hydrated, setHydrated] = useState(false)
  const lockupSrc = getCityHeaderLockupPath(provinceSlug, 'onBrand')
  const logoSrc = getCityLogoPath(provinceSlug)

  useEffect(() => {
    setHydrated(true)
  }, [])

  const profileHref =
    hydrated && !loading && user
      ? ROUTES.PROFILE(user.username || user.uid)
      : ROUTES.LOGIN

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
        <button
          type="button"
          onClick={onMenuClick}
          className="flex h-11 w-11 shrink-0 items-center justify-center text-white"
          aria-label="Menü"
        >
          <Menu className="h-6 w-6" strokeWidth={2} />
        </button>

        <Link
          href="/"
          className="flex min-w-0 flex-1 items-center gap-[3px]"
          aria-label={`${cityName} NaHaber`}
        >
          {lockupSrc ? (
            <Image
              src={lockupSrc}
              alt={`${cityName} NaHaber`}
              width={480}
              height={40}
              className="h-10 w-auto max-w-full border-0 bg-transparent p-0 object-contain object-left"
              priority
            />
          ) : logoSrc ? (
            <>
              <Image
                src={logoSrc}
                alt=""
                width={40}
                height={40}
                className="h-10 w-10 shrink-0 border-0 bg-transparent p-0 object-contain"
                priority
              />
              <span className="flex h-10 min-w-0 items-center truncate text-[1.5rem] font-black leading-none tracking-tight">
                <span className="text-white">{cityName}</span>
                <span className="ml-1.5 text-[#E50914]">NaHaber</span>
              </span>
            </>
          ) : (
            <>
              <BrandWordmark variant="onBrand" size="md" className="font-black" />
              <span className="truncate text-sm font-bold text-white/90">{cityName}</span>
            </>
          )}
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
          <NotificationBell variant="onBrand" />
          <Link
            href={profileHref}
            className="flex h-11 w-11 items-center justify-center text-white"
            aria-label="Profil"
          >
            <User className="h-[22px] w-[22px]" strokeWidth={2} />
          </Link>
        </div>
      </div>
    </header>
  )
}
