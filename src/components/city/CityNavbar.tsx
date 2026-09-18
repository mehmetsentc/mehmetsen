'use client'

import { Suspense, useEffect, useState, type Ref } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search, Menu, User } from 'lucide-react'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { CityBrandLockup } from '@/components/city/CityBrandLockup'
import { useAuth } from '@/hooks/useAuth'
import { useMyPublishers } from '@/hooks/useMyPublishers'
import { resolvePublisherProfileHref } from '@/lib/nav/publisherProfileNav'
import { useChromeOffset } from '@/hooks/useChromeOffset'
import { useCityCategoryFilter } from '@/store/cityCategoryContext'
import { CategoryNav } from '@/components/layout/CategoryNav'
import { isCityFeedPath } from '@/lib/cityPaths'
import { cn } from '@/lib/utils'

interface CityNavbarProps {
  cityName: string
  provinceSlug: string
  onMenuClick?: () => void
}

function CityFeedCategoryRail({ overlay = false }: { overlay?: boolean }) {
  const searchParams = useSearchParams()
  const { categories, activeCategoryId, setActiveCategoryId } = useCityCategoryFilter()

  useEffect(() => {
    setActiveCategoryId(searchParams.get('category'))
  }, [searchParams, setActiveCategoryId])

  const navCategories = [
    { id: '__all', label: 'Hepsi', href: '/' },
    ...categories.map((c) => ({ id: c.id, label: c.name, href: `/?category=${c.id}` })),
  ]

  return (
    <CategoryNav
      categories={navCategories}
      onCategorySelect={setActiveCategoryId}
      activeCategoryId={activeCategoryId}
      embedded
      overlay={overlay}
    />
  )
}

export function CityNavbar({ cityName, provinceSlug, onMenuClick }: CityNavbarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, loading } = useAuth()
  const { publishers, loading: publishersLoading, isPublisher } = useMyPublishers()
  const [hydrated, setHydrated] = useState(false)
  const showChips = isCityFeedPath(pathname)
  const overlayFeed = showChips
  const { ref: chromeRef, height: chromeHeight } = useChromeOffset(!overlayFeed)

  useEffect(() => {
    setHydrated(true)
  }, [])

  const profileHref =
    hydrated && !loading && !publishersLoading && user && isPublisher
      ? resolvePublisherProfileHref(publishers)
      : null

  return (
    <div className="city-mobile-only-chrome lg:hidden">
      <div
        ref={chromeRef as Ref<HTMLDivElement>}
        className={cn(
          'mobile-top-chrome is-fixed z-[100] lg:hidden',
          overlayFeed
            ? 'max-lg:mobile-top-chrome--overlay max-lg:text-white lg:bg-[rgb(var(--header-brand-bg))] lg:text-[rgb(var(--header-onbrand))]'
            : 'bg-[rgb(var(--header-brand-bg))] text-[rgb(var(--header-onbrand))]',
          'pt-[var(--mobile-sat,env(safe-area-inset-top,0px))]'
        )}
      >
        <header className="h-[72px]">
          <div className="newspaper-layout-inner flex h-full items-center gap-0.5 px-1 sm:gap-1 sm:px-0">
            <button
              type="button"
              onClick={onMenuClick}
              className="flex h-10 w-10 shrink-0 items-center justify-center text-[rgb(var(--header-onbrand))] sm:h-11 sm:w-11"
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
                className="flex h-10 w-10 items-center justify-center text-[rgb(var(--header-onbrand))] sm:h-11 sm:w-11"
                aria-label="Ara"
              >
                <Search className="h-5 w-5 sm:h-[22px] sm:w-[22px]" strokeWidth={2} />
              </button>
              <NotificationBell
                variant="onBrand"
                iconClassName="h-5 w-5 sm:h-[22px] sm:w-[22px]"
                buttonClassName="relative flex h-10 w-10 items-center justify-center text-[rgb(var(--header-onbrand))] sm:h-11 sm:w-11"
              />
              {profileHref ? (
                <Link
                  href={profileHref}
                  className="flex h-10 w-10 items-center justify-center text-[rgb(var(--header-onbrand))] sm:h-11 sm:w-11"
                  aria-label="Profil"
                >
                  <User className="h-5 w-5 sm:h-[22px] sm:w-[22px]" strokeWidth={2} />
                </Link>
              ) : null}
            </div>
          </div>
        </header>

        {showChips ? (
          <Suspense fallback={null}>
            <CityFeedCategoryRail overlay />
          </Suspense>
        ) : null}
      </div>

      {overlayFeed ? null : (
        <div
          className="shrink-0"
          aria-hidden
          style={{
            height:
              chromeHeight > 0
                ? chromeHeight
                : 'calc(72px + var(--mobile-sat, env(safe-area-inset-top, 0px)))',
          }}
        />
      )}
    </div>
  )
}
