'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import type { Ref } from 'react'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { BrandWordmark } from '@/components/brand/BrandWordmark'
import { CityBrandLockup } from '@/components/city/CityBrandLockup'
import { useChromeOffset } from '@/hooks/useChromeOffset'
import { cn } from '@/lib/utils'

interface CityHeaderProps {
  cityName: string
  provinceSlug?: string
}

export function CityHeader({ cityName, provinceSlug }: CityHeaderProps) {
  const router = useRouter()
  const { ref: chromeRef, height: chromeHeight } = useChromeOffset(true)

  return (
    <>
      <header
        ref={chromeRef as Ref<HTMLElement>}
        className={cn(
          'mobile-top-chrome is-fixed z-[100]',
          'bg-[rgb(var(--header-brand-bg))] text-white',
          'pt-[env(safe-area-inset-top,0px)]'
        )}
      >
        <div className="flex h-14 items-center gap-1.5 px-3">
          <Link
            href="/"
            className="flex min-w-0 flex-1 items-center"
            aria-label={`${cityName} NaHaber`}
          >
            {provinceSlug ? (
              <CityBrandLockup
                cityName={cityName}
                provinceSlug={provinceSlug}
                tone="onBrand"
                size="sm"
                priority
              />
            ) : (
              <>
                <BrandWordmark variant="onBrand" size="sm" className="font-black text-[1.35rem]" />
                <span className="ml-2 truncate text-xs font-bold uppercase tracking-wider text-white/80">
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
      <div
        className="lg:hidden shrink-0"
        aria-hidden
        style={{
          height:
            chromeHeight > 0
              ? chromeHeight
              : 'calc(env(safe-area-inset-top, 0px) + 3.5rem)',
        }}
      />
    </>
  )
}
