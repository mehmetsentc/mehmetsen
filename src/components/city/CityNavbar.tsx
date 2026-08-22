'use client'

import { useEffect, useState, type Ref } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { Search, Menu, User } from 'lucide-react'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { CityBrandLockup } from '@/components/city/CityBrandLockup'
import { useAuth } from '@/hooks/useAuth'
import { ROUTES } from '@/constants/routes'
import { useChromeOffset } from '@/hooks/useChromeOffset'
import { cn } from '@/lib/utils'

interface CityNavbarProps {
  cityName: string
  provinceSlug: string
  onMenuClick?: () => void
}

export function CityNavbar({ cityName, provinceSlug, onMenuClick }: CityNavbarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, loading } = useAuth()
  const [hydrated, setHydrated] = useState(false)
  const { ref: chromeRef, height: chromeHeight } = useChromeOffset(true)

  useEffect(() => {
    setHydrated(true)
  }, [])

  const profileHref =
    hydrated && !loading && user
      ? ROUTES.PROFILE(user.username || user.uid)
      : ROUTES.LOGIN

  // Article pages use ArticleStickyHeader on mobile.
  if (pathname.startsWith('/haber/')) return null

  return (
    <>
      <header
        ref={chromeRef as Ref<HTMLElement>}
        className={cn(
          'mobile-top-chrome is-fixed z-[100]',
          'bg-[rgb(var(--header-brand-bg))] text-white',
          'pt-[var(--mobile-sat,env(safe-area-inset-top,0px))]'
        )}
        style={{ height: 'calc(72px + var(--mobile-sat, env(safe-area-inset-top, 0px)))' }}
      >
        <div className="newspaper-layout-inner flex h-[72px] items-center gap-0.5 px-1 sm:gap-1 sm:px-0">
          <button
            type="button"
            onClick={onMenuClick}
            className="flex h-10 w-10 shrink-0 items-center justify-center text-white sm:h-11 sm:w-11"
            aria-label="Menü"
          >
            <Menu className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={2} />
          </button>

          <Link
            href="/"
            className="flex min-w-0 flex-1 items-center overflow-hidden pr-1"
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
              className="flex h-10 w-10 items-center justify-center text-white sm:h-11 sm:w-11"
              aria-label="Ara"
            >
              <Search className="h-5 w-5 sm:h-[22px] sm:w-[22px]" strokeWidth={2} />
            </button>
            <NotificationBell
              variant="onBrand"
              iconClassName="h-5 w-5 sm:h-[22px] sm:w-[22px]"
              buttonClassName="relative flex h-10 w-10 items-center justify-center text-white sm:h-11 sm:w-11"
            />
            <Link
              href={profileHref}
              className="flex h-10 w-10 items-center justify-center text-white sm:h-11 sm:w-11"
              aria-label="Profil"
            >
              <User className="h-5 w-5 sm:h-[22px] sm:w-[22px]" strokeWidth={2} />
            </Link>
          </div>
        </div>
      </header>
      <div
        className="lg:hidden shrink-0"
        aria-hidden
        style={{
          height:
            chromeHeight > 0
              ? chromeHeight
              : 'calc(72px + var(--mobile-sat, env(safe-area-inset-top, 0px)))',
        }}
      />
    </>
  )
}
