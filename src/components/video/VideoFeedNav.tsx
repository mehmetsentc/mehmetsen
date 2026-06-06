'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Search, PlusSquare, Bookmark, User } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/lib/utils'

export function VideoFeedNav() {
  const pathname = usePathname()
  const { user } = useAuth()

  const items = [
    { icon: Home, href: ROUTES.FEED },
    { icon: Search, href: ROUTES.SEARCH },
    { icon: PlusSquare, href: ROUTES.POST_CREATE },
    { icon: Bookmark, href: ROUTES.SAVED },
    { icon: User, href: user ? ROUTES.PROFILE(user.username) : ROUTES.LOGIN },
  ]

  return (
    <nav className="pointer-events-none fixed bottom-0 left-0 right-0 z-40 lg:hidden">
      <div className="pointer-events-auto mx-auto flex h-14 max-w-lg items-center justify-around bg-gradient-to-t from-black/80 to-transparent px-4 pb-2 pt-6">
        {items.map(({ icon: Icon, href }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center justify-center rounded-xl p-2.5 transition-colors',
                active ? 'text-white' : 'text-white/60 hover:text-white'
              )}
            >
              <Icon className={cn('h-6 w-6', active && 'stroke-[2.5]')} />
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
