'use client'

import { Suspense, useEffect, useState, type Ref } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
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
  const { categories, activeCategoryId, setActiveCategoryId } = useCityCategoryFilter()

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
  const pathname = usePathname() || '/'
  const { user, loading } = useAuth()
  const { publishers, loading: publishersLoading, isPublisher } = useMyPublishers()
  const [hydrated, setHydrated] = useState(false)
  const showChips = isCityFeedPath(pathname)
  const overlayFeed = showChips
  const { ref: chromeRef, height: chromeHeight } = useChromeOffset(!overlayFeed)

  useEffect(() => {
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!overlayFeed) return
    const root = document.documentElement
    root.setAttribute('data-city-overlay-chrome', '1')
    return () => {
      root.removeAttribute('data-city-overlay-chrome')
    }
  }, [overlayFeed])

  const profileHref =
    hydrated && !loading && !publishersLoading && user && isPublisher
      ? resolvePublisherProfileHref(publishers)
      : null

  return (
    <div className="city-mobile-only-chrome lg:hidden">
      <div
        ref={chromeRef as Ref<HTMLDivElement>}
        data-city-overlay-chrome={overlayFeed ? '1' : undefined}
        className={cn(
          'mobile-top-chrome is-fixed z-[100] lg:hidden',
          overlayFeed
            ? 'mobile-top-chrome--overlay text-white'
            : 'bg-[rgb(var(--header-brand-bg))] text-[rgb(var(--header-onbrand))]',
          overlayFeed
            ? 'pt-0.5'
            : 'pt-[var(--mobile-sat,env(safe-area-inset-top,0px))]'
        )}
        style={
          overlayFeed
            ? { background: 'transparent', backgroundColor: 'transparent', borderBottom: '0' }
            : undefined
        }
      >
        <header className={overlayFeed ? 'h-8' : 'h-[72px]'}>
          <div className="newspaper-layout-inner flex h-full items-center gap-0.5 px-1 sm:gap-1 sm:px-0">
            <button
              type="button"
              onClick={onMenuClick}
              className={cn(
                'flex shrink-0 items-center justify-center text-[rgb(var(--header-onbrand))]',
                overlayFeed ? 'h-8 w-8' : 'h-10 w-10 sm:h-11 sm:w-11'
              )}
              aria-label="Menü"
            >
              <Menu className={overlayFeed ? 'h-4 w-4' : 'h-5 w-5 sm:h-6 sm:w-6'} strokeWidth={2} />
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
                size={overlayFeed ? 'xs' : 'sm'}
                priority
              />
            </Link>

            <div className="flex shrink-0 items-center">
              <button
                type="button"
                onClick={() => router.push('/search')}
                className={cn(
                  'flex items-center justify-center text-[rgb(var(--header-onbrand))]',
                  overlayFeed ? 'h-8 w-8' : 'h-10 w-10 sm:h-11 sm:w-11'
                )}
                aria-label="Ara"
              >
                <Search className={overlayFeed ? 'h-4 w-4' : 'h-5 w-5 sm:h-[22px] sm:w-[22px]'} strokeWidth={2} />
              </button>
              <NotificationBell
                variant="onBrand"
                iconClassName={overlayFeed ? 'h-4 w-4' : 'h-5 w-5 sm:h-[22px] sm:w-[22px]'}
                buttonClassName={
                  overlayFeed
                    ? 'relative flex h-8 w-8 items-center justify-center text-[rgb(var(--header-onbrand))]'
                    : 'relative flex h-10 w-10 items-center justify-center text-[rgb(var(--header-onbrand))] sm:h-11 sm:w-11'
                }
              />
              {profileHref ? (
                <Link
                  href={profileHref}
                  className={cn(
                    'flex items-center justify-center text-[rgb(var(--header-onbrand))]',
                    overlayFeed ? 'h-8 w-8' : 'h-10 w-10 sm:h-11 sm:w-11'
                  )}
                  aria-label="Profil"
                >
                  <User className={overlayFeed ? 'h-4 w-4' : 'h-5 w-5 sm:h-[22px] sm:w-[22px]'} strokeWidth={2} />
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
