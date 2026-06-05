'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Home, Search, Bell, Bookmark, PlusSquare, LogOut } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { ROUTES } from '@/constants/routes'
import toast from 'react-hot-toast'

const navItems = [
  { icon: Home,      label: 'Ana Akış',    href: ROUTES.FEED },
  { icon: Search,    label: 'Ara',         href: ROUTES.SEARCH },
  { icon: Bell,      label: 'Bildirimler', href: ROUTES.NOTIFICATIONS },
  { icon: Bookmark,  label: 'Kaydedilenler', href: ROUTES.SAVED },
  { icon: PlusSquare, label: 'Haber Ekle', href: ROUTES.POST_CREATE },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout } = useAuth()

  const handleLogout = async () => {
    await logout()
    toast.success('Çıkış yapıldı')
    router.push(ROUTES.LOGIN)
  }

  return (
    <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col py-4 lg:flex">
      <Link href={ROUTES.FEED} className="mb-6 px-3">
        <span className="text-2xl font-black text-blue-600">NaHaber</span>
      </Link>

      <nav className="flex-1 space-y-1">
        {navItems.map(({ icon: Icon, label, href }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          )
        })}
      </nav>

      {user && (
        <div className="space-y-1 border-t border-gray-100 pt-3">
          <Link
            href={ROUTES.PROFILE(user.username)}
            className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-gray-100"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-600">
              {user.displayName[0].toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-900">{user.displayName}</p>
              <p className="truncate text-xs text-gray-500">@{user.username}</p>
            </div>
          </Link>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-gray-500 transition-colors hover:bg-gray-100 hover:text-red-500"
          >
            <LogOut className="h-4 w-4" />
            Çıkış Yap
          </button>
        </div>
      )}
    </aside>
  )
}
