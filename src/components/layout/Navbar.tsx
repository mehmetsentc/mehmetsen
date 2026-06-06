'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher'
import { ROUTES } from '@/constants/routes'

export function Navbar() {
  const { user } = useAuth()
  const pathname = usePathname()

  if (pathname === ROUTES.FEED) return null

  return (
    <header className="sticky top-0 z-40 border-b border-gray-100 bg-white/90 backdrop-blur-sm lg:hidden">
      <div className="flex h-14 items-center justify-between px-4">
        <Link href={ROUTES.FEED} className="text-xl font-black text-blue-600">
          NaHaber
        </Link>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <Link
            href={ROUTES.NOTIFICATIONS}
            className="rounded-full p-2 text-gray-500 hover:bg-gray-100"
          >
            <Bell className="h-5 w-5" />
          </Link>
          {user && (
            <Link href={ROUTES.PROFILE(user.username)}>
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-600">
                {user.displayName[0].toUpperCase()}
              </div>
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
