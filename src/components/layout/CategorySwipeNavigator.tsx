'use client'

import { usePathname } from 'next/navigation'
import { getSwipeIndexFromPathname } from '@/constants/config'
import { useCategorySwipe } from '@/hooks/useCategorySwipe'

const DISABLED_PREFIXES = [
  '/haber/',
  '/post/',
  '/profile/',
  '/messages',
  '/admin',
  '/reels',
  '/login',
  '/register',
  '/settings',
  '/search',
  '/discover',
  '/notifications',
  '/events',
  '/uygulama',
]

function isCategorySwipeRoute(pathname: string): boolean {
  if (DISABLED_PREFIXES.some((p) => pathname.startsWith(p))) return false
  return getSwipeIndexFromPathname(pathname) >= 0
}

/** Mobil yatay kaydırma ile ana feed ↔ kategoriler arası gezinme. */
export function CategorySwipeNavigator() {
  const pathname = usePathname()
  const enabled = isCategorySwipeRoute(pathname)
  useCategorySwipe(enabled)
  return null
}
