'use client'

import { useEffect, useState, type Ref } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search, Menu, User } from 'lucide-react'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { CityBrandLockup } from '@/components/city/CityBrandLockup'
import { useAuth } from '@/hooks/useAuth'
import { ROUTES } from '@/constants/routes'
import { useChromeOffset } from '@/hooks/useChromeOffset'
import { useCityCategoryFilter } from '@/store/cityCategoryContext'
import { CategoryNav } from '@/components/layout/CategoryNav'
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
  const { ref: chromeRef, height: chromeHeight } = useChromeOffset(true)
  const { categories, activeCategoryId, setActiveCategoryId } = useCityCategoryFilter()

  useEffect(() => {
    setHydrated(true)
  }, [])

  const profileHref =
    hydrated && !loading && user
      ? ROUTES.PROFILE(user.username || user.uid)
      : ROUTES.LOGIN

  const navCategories = [
    { id: '__all', label: 'Hepsi', href: '/' },
    ...categories.map((c) => ({ id: c.id, label: c.name, href: `/?category=${c.id}` })),
  ]

  return (
    <>
      <div
        ref={chromeRef as Ref<HTMLDivElement>}
        className={cn(
          'mobile-top-chrome is-fixed z-[100]',
          'bg-[rgb(var(--header-brand-bg))] text-white',
          'pt-[var(--mobile-sat,env(safe-area-inset-top,0px))]'
        )}
      >
        <header className="h-[72px]">
          <div className="newspaper-layout-inner flex h-full items-center gap-0.5 px-1 sm:gap-1 sm:px-0">
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

        {/* Category nav — ulusal site ile aynı stil (navy bar, text links) */}
        <CategoryNav
          categories={navCategories}
          onCategorySelect={setActiveCategoryId}
          activeCategoryId={activeCategoryId}
          embedded
        />
      </div>

      {/* Chrome spacer — 72px brand bar + 48px category bar */}
      <div
        className="lg:hidden shrink-0"
        aria-hidden
        style={{
          height:
            chromeHeight > 0
              ? chromeHeight
              : 'calc(72px + 48px + var(--mobile-sat, env(safe-area-inset-top, 0px)))',
        }}
      />
    </>
  )
}
