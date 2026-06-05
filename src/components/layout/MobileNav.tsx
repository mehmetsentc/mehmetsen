'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Search, PlusSquare, Bookmark, User } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { ROUTES } from '@/constants/routes'

export function MobileNav() {
  const pathname = usePathname()
  const { user } = useAuth()

  const items = [
    { icon: Home,       href: ROUTES.FEED },
    { icon: Search,     href: ROUTES.SEARCH },
    { icon: PlusSquare, href: ROUTES.POST_CREATE },
    { icon: Bookmark,   href: ROUTES.SAVED },
    { icon: User,       href: user ? ROUTES.PROFILE(user.username) : ROUTES.LOGIN },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-100 bg-white lg:hidden">
      <div className="flex h-16 items-center justify-around">
        {items.map(({ icon: Icon, href }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center justify-center rounded-xl p-3 transition-colors ${
                active ? 'text-blue-600' : 'text-gray-400 hover:text-gray-700'
              }`}
            >
              <Icon className={`h-6 w-6 ${active ? 'stroke-[2.5]' : ''}`} />
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
