'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search, Menu, User } from 'lucide-react'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { CityBrandLockup } from '@/components/city/CityBrandLockup'
import { useAuth } from '@/hooks/useAuth'
import { ROUTES } from '@/constants/routes'
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
          className="flex min-w-0 flex-1 items-center"
          aria-label={`${cityName} NaHaber`}
        >
          <CityBrandLockup
            cityName={cityName}
            provinceSlug={provinceSlug}
            tone="onBrand"
            size="sm"
            priority
          />
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
