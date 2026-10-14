'use client'

import { useEffect, useState } from 'react'

/**
 * True below Tailwind `lg` (1024px) — phones AND tablets in portrait get the mobile
 * admin panel (MOBILE-ADMIN-1 Faz 4); the desktop sidebar CMS starts at 1024px.
 */
export function useIsMobileAdminViewport() {
  const [isMobile, setIsMobile] = useState<boolean | null>(null)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)')
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  return isMobile
}
