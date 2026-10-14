'use client'

/**
 * City subdomain route shell (loading.tsx for /etkinlik, /is-ilanlari, /nobetci-eczaneler,
 * /ilceler, /spor and the city home). Each of those pages mounts its own city chrome, so a
 * tab switch used to drop to a full-screen spinner until the server answered. This shell
 * draws the same top bar and bottom nav (tapped tab already active) with content skeletons,
 * so switching tabs looks like the national site. On www it is the old spinner.
 * Only the loading UI changes: no route, metadata, canonical or link changes.
 */
import { useSyncExternalStore } from 'react'
import { usePathname } from 'next/navigation'
import { Menu, Search, Bell } from 'lucide-react'
import RootRouteLoading from '@/components/layout/RootRouteLoading'
import { TimelineItemSkeleton } from '@/components/ui/Skeleton'
import { CityBrandLockup } from '@/components/city/CityBrandLockup'
import { getCityCategoryName } from '@/constants/cities'
import { buildCitySectionNavItems } from '@/lib/citySidebarNav'
import { isCitySectionActive } from '@/lib/cityPaths'
import { cn } from '@/lib/utils'

export const CITY_HAS_SPOR_KEY = 'nh:city-has-spor'

const noop = () => () => {}
/** Same rule as lib/cityHost (kept inline: that module also reads next/headers). */
function readSlug(): string | null {
  const host = window.location.hostname.toLowerCase()
  const m = host.match(/^([a-z0-9-]+)\.(?:nahaber\.com|localhost)$/)
  return m && m[1] !== 'www' ? m[1] : null
}
function readHasSpor(): boolean {
  try {
    return window.sessionStorage.getItem(CITY_HAS_SPOR_KEY) === '1'
  } catch {
    return false
  }
}

export default function CityRouteLoading() {
  // server / hydration: null (generic shell); client navigation: the real city at once
  const slug = useSyncExternalStore(noop, readSlug, () => null)
  const hasSpor = useSyncExternalStore(noop, readHasSpor, () => false)
  const pathname = usePathname() || '/'
  if (!slug) return <RootRouteLoading />

  const cityName = getCityCategoryName(slug)
  const items = buildCitySectionNavItems({ hasSpor, citySlug: slug })

  return (
    <div className="min-h-dvh bg-[rgb(var(--color-surface))]" data-city-route-loading="1">
      <div className="city-mobile-only-chrome lg:hidden">
        <div className="mobile-top-chrome is-fixed z-[100] bg-[rgb(var(--header-brand-bg))] pt-[var(--mobile-sat,env(safe-area-inset-top,0px))] text-[rgb(var(--header-onbrand))] lg:hidden">
          <header className="h-[72px]">
            <div className="newspaper-layout-inner flex h-full items-center gap-0.5 px-1 sm:gap-1 sm:px-0">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center sm:h-11 sm:w-11">
                <Menu className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={2} />
              </span>
              <span className="flex min-w-0 flex-1 items-center overflow-hidden pr-1">
                <CityBrandLockup cityName={cityName} provinceSlug={slug} tone="onBrand" size="sm" priority />
              </span>
              <span className="flex h-10 w-10 items-center justify-center sm:h-11 sm:w-11">
                <Search className="h-5 w-5 sm:h-[22px] sm:w-[22px]" strokeWidth={2} />
              </span>
              <span className="flex h-10 w-10 items-center justify-center sm:h-11 sm:w-11">
                <Bell className="h-5 w-5 sm:h-[22px] sm:w-[22px]" strokeWidth={2} />
              </span>
            </div>
          </header>
        </div>
      </div>

      <div className="content-stage content-stage-newspaper">
        <div className="content-main content-main-newspaper desktop-newspaper pt-[calc(72px+var(--mobile-sat,env(safe-area-inset-top,0px)))] lg:pt-4">
          <div className="w-full space-y-4 py-2" aria-busy="true" aria-label="Yükleniyor">
            {[0, 1, 2].map((i) => (
              <TimelineItemSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>

      <nav
        className="city-mobile-bottom-nav mobile-bottom-nav pointer-events-none fixed inset-x-0 bottom-0 z-[105] flex justify-center px-[var(--mobile-nav-inset-x)] lg:hidden"
        aria-hidden="true"
      >
        <div className="city-mobile-bottom-nav-pill pointer-events-auto">
          {items.map((item) => {
            const Icon = item.icon
            const active = isCitySectionActive(pathname, item.href)
            return (
              <span key={item.id} className="flex min-w-0 flex-1 flex-col items-center justify-center px-0.5">
                <span
                  className={cn(
                    'city-mobile-bottom-nav-icon flex h-8 w-8 items-center justify-center rounded-full',
                    active ? 'city-mobile-bottom-nav-icon--active bg-white/20 text-white' : 'bg-transparent text-white/80'
                  )}
                >
                  <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.4 : 2} />
                </span>
                <span className={cn('mt-0.5 max-w-full truncate text-[10px] font-semibold leading-none', active ? 'text-white' : 'text-white/55')}>
                  {item.shortLabel || item.label}
                </span>
              </span>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
