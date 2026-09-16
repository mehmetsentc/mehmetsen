'use client'

import { usePathname } from 'next/navigation'
import { DesktopScrollHeader } from '@/components/home/desktop/DesktopScrollHeader'
import { useScrollHeaderContext } from '@/context/ScrollHeaderContext'
import { pathIs, ROUTES } from '@/constants/routes'

function shouldShowGlobalScrollHeader(pathname: string): boolean {
  if (pathname === ROUTES.REELS || pathname.startsWith(`${ROUTES.REELS}/`)) return false
  if (pathname === '/feed-v2' || pathname.startsWith('/feed-v2/')) return false
  if (pathIs(pathname, ROUTES.MESSAGES, '/messages')) return false
  if (pathname.startsWith('/admin')) return false
  if (pathIs(pathname, ROUTES.LOGIN, '/login', ROUTES.REGISTER, '/register', '/onboarding')) {
    return false
  }
  if (pathIs(pathname, ROUTES.SAVED, '/saved', ROUTES.SETTINGS, '/settings')) return false
  if (pathIs(pathname, ROUTES.NOTIFICATIONS, '/notifications')) return false
  return true
}

export function DesktopGlobalScrollHeader() {
  const pathname = usePathname()
  const { config } = useScrollHeaderContext()

  if (!shouldShowGlobalScrollHeader(pathname)) return null

  return (
    <div className="hidden lg:block">
      <DesktopScrollHeader
        breakingItems={config.breakingItems}
        showBreaking={config.showBreaking}
        subcategories={config.subcategories}
        tabParent={config.tabParent}
      />
    </div>
  )
}
