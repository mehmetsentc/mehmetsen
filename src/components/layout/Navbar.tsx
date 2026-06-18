'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Search, Menu, Bell, User } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { ROUTES } from '@/constants/routes'
import { CategoryNav } from './CategoryNav'
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
          'sticky top-0 z-40 lg:hidden',
          'border-b border-[rgb(var(--color-brand))]/30 bg-[rgb(var(--color-card))]',
          isFeed && 'h-[72px]'
        )}
      >
        <div className={cn('flex items-center gap-3 px-4', isFeed ? 'h-[72px]' : 'h-14')}>
          <button
            type="button"
            onClick={onMenuClick}
            className="text-[rgb(var(--color-text))]"
            aria-label="Menü"
          >
            <Menu className="h-6 w-6" strokeWidth={2} />
          </button>

          {/* Logo — logo renklerine uyarlanmış: Na=kırmızı, Haber=beyaz, .com=muted */}
          <Link href={ROUTES.FEED} className="flex-1" aria-label="NaHaber">
            <span className="text-[1.45rem] font-black leading-none tracking-tight">
              <span className="text-[rgb(var(--color-brand))]">Na</span>
              <span className="text-[rgb(var(--color-text))]">Haber</span>
              <span className="text-[rgb(var(--color-muted))] text-base font-semibold">.com</span>
            </span>
          </Link>

          <div className="flex items-center gap-1">
            {!isFeed ? (
              <button
                type="button"
                onClick={() => router.push(ROUTES.DISCOVER)}
                className="flex h-9 w-9 items-center justify-center text-[rgb(var(--color-text))]"
                aria-label="Ara"
              >
                <Search className="h-5 w-5" strokeWidth={2} />
              </button>
            ) : null}
            <Link
              href={ROUTES.NOTIFICATIONS}
              className="flex h-9 w-9 items-center justify-center text-[rgb(var(--color-text))]"
              aria-label="Bildirimler"
            >
              <Bell className="h-5 w-5" strokeWidth={2} />
            </Link>
            <Link
              href={profileHref}
              className="flex h-9 w-9 items-center justify-center text-[rgb(var(--color-text))]"
              aria-label="Profil"
            >
              <User className="h-5 w-5" strokeWidth={2} />
            </Link>
          </div>
        </div>
      </header>

      {!isFeed ? <CategoryNav /> : null}
    </>
  )
}
