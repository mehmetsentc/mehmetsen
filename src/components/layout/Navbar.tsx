'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Search, Menu, User } from 'lucide-react'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { useAuth } from '@/hooks/useAuth'
import { ROUTES } from '@/constants/routes'
import { CategoryNav } from './CategoryNav'
import { BackNavButton } from '@/components/layout/BackNavButton'
import { BrandWordmark } from '@/components/brand/BrandWordmark'
import { cn } from '@/lib/utils'

interface NavbarProps {
  onMenuClick?: () => void
}

export function Navbar({ onMenuClick }: NavbarProps = {}) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [hydrated, setHydrated] = useState(false)
  const isFeed = pathname === ROUTES.FEED
  // Reels uses the floating GlobalBackNav (immersive). Elsewhere show inline back.
  const showBack =
    !isFeed &&
    pathname !== ROUTES.HOME &&
    pathname !== '/' &&
    pathname !== ROUTES.REELS
  // Article pages get a dedicated compact sticky header (ArticleStickyHeader).
  // Keep this site header in normal flow there so we don't stack two top bars.
  const isArticle = pathname.startsWith('/haber/')

  useEffect(() => {
    setHydrated(true)
  }, [])

  const profileHref =
    hydrated && !loading && user
      ? ROUTES.PROFILE(user.username || user.uid)
      : ROUTES.LOGIN

  return (
    <div
      className={cn(
        'mobile-top-chrome z-50 lg:hidden',
        isArticle ? 'relative' : 'sticky top-0',
        'bg-[rgb(var(--header-brand-bg))] text-white',
        // Cover status-bar region except on article pages (ArticleStickyHeader owns that).
        !isArticle && 'pt-[env(safe-area-inset-top,0px)]'
      )}
    >
      <header
        className={cn(
          'bg-[rgb(var(--header-brand-bg))] text-white',
          isFeed ? 'h-[72px]' : 'h-14'
        )}
      >
        <div
          className={cn(
            'flex h-full items-center',
            isFeed ? 'gap-1 px-4' : 'gap-1.5 px-2 sm:px-3'
          )}
        >
          {showBack ? (
            <BackNavButton className="back-nav-btn--navbar back-nav-btn--on-brand" />
          ) : null}
          <button
            type="button"
            onClick={onMenuClick}
            className="flex h-11 w-11 shrink-0 items-center justify-center text-white"
            aria-label="Menü"
          >
            <Menu className="h-6 w-6" strokeWidth={2} />
          </button>

          {/* Logo — Theme D: Na beyaz + Haber brand kırmızı (kömür bar) */}
          <Link href={ROUTES.FEED} className="min-w-0 flex-1 px-1" aria-label="NaHaber">
            <BrandWordmark
              variant="onBrand"
              size={isFeed ? 'md' : 'sm'}
              className={cn('font-black', !isFeed && 'text-[1.45rem]')}
            />
          </Link>

          <div className="flex shrink-0 items-center">
            <button
              type="button"
              onClick={() => router.push(ROUTES.SEARCH)}
              className="flex h-11 w-11 items-center justify-center text-white touch-manipulation"
              aria-label="Ara"
            >
              <Search className={cn(isFeed ? 'h-[22px] w-[22px]' : 'h-5 w-5')} strokeWidth={2} />
            </button>
            <NotificationBell
              variant="onBrand"
              iconClassName={cn(isFeed ? 'h-[22px] w-[22px]' : 'h-5 w-5')}
            />
            <Link
              href={profileHref}
              className="flex h-11 w-11 items-center justify-center text-white touch-manipulation"
              aria-label="Profil"
            >
              <User className={cn(isFeed ? 'h-[22px] w-[22px]' : 'h-5 w-5')} strokeWidth={2} />
            </Link>
          </div>
        </div>
      </header>

      {/* Embedded in chrome so category bar shares one sticky stack (no dual-sticky gap). */}
      <CategoryNav embedded />
    </div>
  )
}
