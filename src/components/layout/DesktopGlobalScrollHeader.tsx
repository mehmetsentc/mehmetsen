'use client'

import { usePathname } from 'next/navigation'
import { DesktopScrollHeader } from '@/components/home/desktop/DesktopScrollHeader'
import { useScrollHeaderContext } from '@/context/ScrollHeaderContext'
import { ROUTES } from '@/constants/routes'

function shouldShowGlobalScrollHeader(pathname: string): boolean {
  if (pathname === ROUTES.REELS) return false
  if (pathname.startsWith('/messages')) return false
  if (pathname.startsWith('/admin')) return false
  if (pathname.startsWith('/login') || pathname.startsWith('/register')) return false
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
