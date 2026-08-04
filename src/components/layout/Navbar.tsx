'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Search, Menu, Bell, User } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { ROUTES } from '@/constants/routes'
import { CategoryNav } from './CategoryNav'
import { BackNavButton } from '@/components/layout/BackNavButton'
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
    <>
      <header
        className={cn(
          'z-40 lg:hidden',
          isArticle ? 'relative' : 'sticky top-0',
          'bg-[rgb(var(--header-brand-bg))] text-white',
          isFeed && 'pt-[env(safe-area-inset-top,0px)]'
        )}
        style={isFeed ? { height: 'calc(72px + env(safe-area-inset-top, 0px))' } : undefined}
      >
        <div
          className={cn(
            'flex items-center',
            isFeed ? 'h-[72px] gap-1 px-4' : 'h-14 gap-1.5 px-2 sm:px-3'
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

          {/* Logo — Concept B: beyaz wordmark kırmızı bar üzerinde */}
          <Link href={ROUTES.FEED} className="min-w-0 flex-1 px-1" aria-label="NaHaber">
            <span
              className={cn(
                'font-black leading-none tracking-tight text-white',
                isFeed ? 'text-[1.55rem]' : 'text-[1.45rem]'
              )}
            >
              NaHaber
            </span>
          </Link>

          <div className="flex shrink-0 items-center">
            <button
              type="button"
              onClick={() => router.push(ROUTES.SEARCH)}
              className="flex h-11 w-11 items-center justify-center text-white"
              aria-label="Ara"
            >
              <Search className={cn(isFeed ? 'h-[22px] w-[22px]' : 'h-5 w-5')} strokeWidth={2} />
            </button>
            <Link
              href={ROUTES.NOTIFICATIONS}
              className="flex h-11 w-11 items-center justify-center text-white"
              aria-label="Bildirimler"
            >
              <Bell className={cn(isFeed ? 'h-[22px] w-[22px]' : 'h-5 w-5')} strokeWidth={2} />
            </Link>
            <Link
              href={profileHref}
              className="flex h-11 w-11 items-center justify-center text-white"
              aria-label="Profil"
            >
              <User className={cn(isFeed ? 'h-[22px] w-[22px]' : 'h-5 w-5')} strokeWidth={2} />
            </Link>
          </div>
        </div>
      </header>

      <CategoryNav />
    </>
  )
}
