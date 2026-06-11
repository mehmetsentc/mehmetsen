'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Search, Settings, Menu, Bell } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import { ROUTES } from '@/constants/routes'

interface NavbarProps {
  onMenuClick?: () => void
}

export function Navbar({ onMenuClick }: NavbarProps = {}) {
  const { user } = useAuth()
  const router = useRouter()
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => { setHydrated(true) }, [])

  return (
    <header className="sticky top-0 z-40 border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] lg:hidden">
      <div className="flex h-14 items-center gap-3 px-4">
        {/* Hamburger */}
        <button
          type="button"
          onClick={onMenuClick}
          className="text-[rgb(var(--color-text))]"
          aria-label="Menü"
        >
          <Menu className="h-6 w-6" strokeWidth={2} />
        </button>

        {/* Logo — text style like haberler.com */}
        <Link href={ROUTES.FEED} className="flex-1" aria-label="NaHaber">
          <span className="text-[1.45rem] font-black leading-none tracking-tight">
            <span className="text-[rgb(var(--color-brand))]">Na</span>
            <span className="text-[rgb(var(--color-text))]">Haber</span>
            <span className="text-[rgb(var(--color-muted))] text-base font-semibold">.com</span>
          </span>
        </Link>

        {/* Right: Search + Bell + Settings */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => router.push(ROUTES.DISCOVER)}
            className="flex h-9 w-9 items-center justify-center text-[rgb(var(--color-text))]"
            aria-label="Ara"
          >
            <Search className="h-5 w-5" strokeWidth={2} />
          </button>
          <Link
            href={ROUTES.NOTIFICATIONS}
            className="flex h-9 w-9 items-center justify-center text-[rgb(var(--color-text))]"
            aria-label="Bildirimler"
          >
            <Bell className="h-5 w-5" strokeWidth={2} />
          </Link>
          <Link
            href={hydrated && user ? ROUTES.SETTINGS : ROUTES.LOGIN}
            className="flex h-9 w-9 items-center justify-center text-[rgb(var(--color-text))]"
            aria-label="Ayarlar"
          >
            <Settings className="h-5 w-5" strokeWidth={2} />
          </Link>
        </div>
      </div>
    </header>
  )
}
